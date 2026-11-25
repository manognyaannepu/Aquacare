require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.static('public'));

// const pool = mysql.createPool({
//     host: process.env.DB_HOST || 'localhost',
//     user: process.env.DB_USER || 'root',
//     password: process.env.DB_PASSWORD || '',
//     database: process.env.DB_NAME || 'aquacare_db',
//     waitForConnections: true,
//     connectionLimit: 10,
//     queueLimit: 0
// });

const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'aquacare_db',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
  ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

function createID(prefix) {
    return (
        prefix +
        '-' +
        Date.now().toString(36).toUpperCase() +
        Math.random().toString(36).slice(2, 6).toUpperCase()
    );
}

function nowFormatted() {
    return new Date().toLocaleString();
}

(async () => {
    try {
        const conn = await pool.getConnection();
        console.log('Connected to MySQL Database successfully!');
        conn.release();
    } catch (err) {
        console.error('MySQL Connection Error:', err.message);
    }
})();

app.post('/api/complaints', async (req, res) => {
    const {
        residentName,
        phone,
        email,
        areaName,
        city,
        pincode,
        complaintType,
        locationDetails,
        latitude,
        longitude,
        description,
        priority,
        imagePath
    } = req.body;

    if (!residentName || !phone || !areaName || !city || !pincode || !complaintType || !locationDetails || !description) {
        return res.status(400).json({ error: 'Missing required complaint fields.' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const timestamp = nowFormatted();

        const [existingResidents] = await conn.query(
            'SELECT resident_id, phone FROM Residents WHERE phone = ? LIMIT 1',
            [phone]
        );

        let residentId;
        if (existingResidents.length > 0) {
            residentId = existingResidents[0].resident_id;
            if (email) {
                await conn.query(
                    'UPDATE Residents SET name = ?, email = ? WHERE resident_id = ?',
                    [residentName, email, residentId]
                );
            }
        } else {
            residentId = createID('RES');
            await conn.query(
                'INSERT INTO Residents (resident_id, name, phone, email) VALUES (?, ?, ?, ?)',
                [residentId, residentName, phone, email || null]
            );
        }

        const [existingAreas] = await conn.query(
            'SELECT area_id FROM Areas WHERE LOWER(area_name) = LOWER(?) AND LOWER(city) = LOWER(?) AND pincode = ? LIMIT 1',
            [areaName, city, pincode]
        );

        let areaId;
        if (existingAreas.length > 0) {
            areaId = existingAreas[0].area_id;
        } else {
            areaId = createID('AREA');
            await conn.query(
                'INSERT INTO Areas (area_id, area_name, city, pincode) VALUES (?, ?, ?, ?)',
                [areaId, areaName, city, pincode]
            );
        }

        const complaintId = createID('WTR');
        const safePriority = ['Low', 'Medium', 'High'].includes(priority) ? priority : 'Medium';

        await conn.query(
            `INSERT INTO Complaints (
                complaint_id, area_id, complaint_type, description, location_details,
                latitude, longitude, image_path, priority, complaint_date, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
            [
                complaintId,
                areaId,
                complaintType,
                description,
                locationDetails,
                latitude !== '' && latitude !== undefined ? latitude : null,
                longitude !== '' && longitude !== undefined ? longitude : null,
                imagePath || null,
                safePriority,
                timestamp
            ]
        );

        const reportId = createID('REP');
        await conn.query(
            `INSERT INTO Complaint_Reports (
                report_id, complaint_id, resident_id, report_date, description, image_path
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [reportId, complaintId, residentId, timestamp, description, imagePath || null]
        );

        const historyId = createID('HIS');
        await conn.query(
            `INSERT INTO Complaint_Status_History (
                history_id, complaint_id, old_status, new_status, updated_by, remarks, updated_at
            ) VALUES (?, ?, NULL, 'Pending', 'Resident', 'Complaint submitted successfully.', ?)`,
            [historyId, complaintId, timestamp]
        );

        await conn.commit();
        res.status(201).json({
            message: 'Complaint submitted successfully!',
            complaint_id: complaintId,
            phone
        });
    } catch (err) {
        await conn.rollback();
        console.error('POST /api/complaints error:', err);
        res.status(500).json({ error: 'Failed to submit complaint to database.' });
    } finally {
        conn.release();
    }
});

app.get('/api/complaints/track', async (req, res) => {
    const complaintId = String(req.query.id || '').trim().toUpperCase();
    const phone = String(req.query.phone || '').trim();

    if (!complaintId || !phone) {
        return res.status(400).json({ error: 'Complaint ID and mobile number are required.' });
    }

    try {
        const [rows] = await pool.query(
            `SELECT c.*, a.area_name, a.city, a.pincode, r.name AS resident_name, r.phone AS resident_phone
             FROM Complaints c
             JOIN Complaint_Reports cr ON c.complaint_id = cr.complaint_id
             JOIN Residents r ON cr.resident_id = r.resident_id
             LEFT JOIN Areas a ON c.area_id = a.area_id
             WHERE UPPER(c.complaint_id) = ? AND r.phone = ?
             LIMIT 1`,
            [complaintId, phone]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Complaint not found. Check your ID and mobile number.' });
        }

        const complaint = rows[0];

        const [assignments] = await pool.query(
            `SELECT asg.*, mt.team_name, mt.team_leader
             FROM Assignments asg
             JOIN Maintenance_Teams mt ON asg.team_id = mt.team_id
             WHERE asg.complaint_id = ?`,
            [complaint.complaint_id]
        );

        const [history] = await pool.query(
            `SELECT * FROM Complaint_Status_History
             WHERE complaint_id = ?`,
            [complaint.complaint_id]
        );

        const latestAssignment = assignments.length > 0 ? assignments[assignments.length - 1] : null;

        res.json({
            complaint,
            team_name: latestAssignment ? latestAssignment.team_name : null,
            history
        });
    } catch (err) {
        console.error('GET /api/complaints/track error:', err);
        res.status(500).json({ error: 'Error tracking complaint.' });
    }
});

app.post('/api/admin/login', (req, res) => {
    const { email, password } = req.body;
    if (email === 'admin@aquacare.com' && password === 'admin123') {
        return res.json({ success: true, admin: { admin_id: 'ADMIN-01', username: 'Administrator', email } });
    }
    return res.status(401).json({ success: false, error: 'Invalid email or password.' });
});

app.get('/api/admin/dashboard', async (req, res) => {
    try {
        const [complaints] = await pool.query(
            `SELECT c.*, a.area_name, a.city, a.pincode, r.name AS resident_name, r.phone AS resident_phone
             FROM Complaints c
             LEFT JOIN Areas a ON c.area_id = a.area_id
             LEFT JOIN Complaint_Reports cr ON c.complaint_id = cr.complaint_id
             LEFT JOIN Residents r ON cr.resident_id = r.resident_id`
        );
        const [residents] = await pool.query('SELECT * FROM Residents');
        const [areas] = await pool.query('SELECT * FROM Areas');
        const [teams] = await pool.query('SELECT * FROM Maintenance_Teams');
        const [assignments] = await pool.query(
            `SELECT asg.*, mt.team_name
             FROM Assignments asg
             LEFT JOIN Maintenance_Teams mt ON asg.team_id = mt.team_id`
        );
        const [reports] = await pool.query(
            `SELECT cr.*, r.name AS resident_name
             FROM Complaint_Reports cr
             LEFT JOIN Residents r ON cr.resident_id = r.resident_id`
        );
        const [history] = await pool.query('SELECT * FROM Complaint_Status_History');
        const [messages] = await pool.query('SELECT * FROM Contact_Messages');

        res.json({
            complaints,
            residents,
            areas,
            teams,
            assignments,
            reports,
            history,
            messages
        });
    } catch (err) {
        console.error('GET /api/admin/dashboard error:', err);
        res.status(500).json({ error: 'Failed to load admin dashboard data.' });
    }
});

app.post('/api/teams', async (req, res) => {
    const { team_name, team_leader, phone, availability } = req.body;
    if (!team_name || !team_leader || !phone) {
        return res.status(400).json({ error: 'All team fields are required.' });
    }

    try {
        const teamId = createID('TEAM');
        const avail = availability === 'Unavailable' ? 'Unavailable' : 'Available';

        await pool.query(
            'INSERT INTO Maintenance_Teams (team_id, team_name, team_leader, phone, availability) VALUES (?, ?, ?, ?, ?)',
            [teamId, team_name, team_leader, phone, avail]
        );

        res.status(201).json({ message: 'Maintenance team added!', team_id: teamId });
    } catch (err) {
        console.error('POST /api/teams error:', err);
        res.status(500).json({ error: 'Failed to add maintenance team.' });
    }
});

app.patch('/api/teams/:teamId/availability', async (req, res) => {
    const { teamId } = req.params;
    try {
        const [rows] = await pool.query(
            'SELECT availability FROM Maintenance_Teams WHERE team_id = ? LIMIT 1',
            [teamId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Team not found.' });
        }

        const nextAvail = rows[0].availability === 'Available' ? 'Unavailable' : 'Available';
        await pool.query(
            'UPDATE Maintenance_Teams SET availability = ? WHERE team_id = ?',
            [nextAvail, teamId]
        );

        res.json({ team_id: teamId, availability: nextAvail });
    } catch (err) {
        console.error('PATCH /api/teams/:teamId/availability error:', err);
        res.status(500).json({ error: 'Failed to update team availability.' });
    }
});

app.post('/api/complaints/:complaintId/assign', async (req, res) => {
    const { complaintId } = req.params;
    const { team_id } = req.body;

    if (!team_id) {
        return res.status(400).json({ error: 'Please select a maintenance team.' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [complaints] = await conn.query(
            'SELECT * FROM Complaints WHERE complaint_id = ? LIMIT 1',
            [complaintId]
        );
        if (complaints.length === 0) {
            await conn.rollback();
            return res.status(404).json({ error: 'Complaint not found.' });
        }

        const complaint = complaints[0];
        if (complaint.status === 'Resolved') {
            await conn.rollback();
            return res.status(400).json({ error: 'This complaint has already been resolved.' });
        }

        const [teams] = await conn.query(
            'SELECT * FROM Maintenance_Teams WHERE team_id = ? LIMIT 1',
            [team_id]
        );
        if (teams.length === 0 || teams[0].availability !== 'Available') {
            await conn.rollback();
            return res.status(400).json({ error: 'Selected team is unavailable.' });
        }

        const timestamp = nowFormatted();
        const assignmentId = createID('ASG');
        const historyId = createID('HIS');

        await conn.query(
            'INSERT INTO Assignments (assignment_id, complaint_id, team_id, admin_id, assigned_date) VALUES (?, ?, ?, ?, ?)',
            [assignmentId, complaintId, team_id, 'ADMIN-01', timestamp]
        );

        await conn.query(
            `INSERT INTO Complaint_Status_History (
                history_id, complaint_id, old_status, new_status, updated_by, remarks, updated_at
            ) VALUES (?, ?, ?, 'Assigned', 'Admin', ?, ?)`,
            [historyId, complaintId, complaint.status, `Assigned to ${teams[0].team_name}`, timestamp]
        );

        await conn.query(
            'UPDATE Complaints SET status = ? WHERE complaint_id = ?',
            ['Assigned', complaintId]
        );

        await conn.commit();
        res.json({ message: 'Maintenance team assigned successfully!' });
    } catch (err) {
        await conn.rollback();
        console.error('POST /api/complaints/:complaintId/assign error:', err);
        res.status(500).json({ error: 'Failed to assign maintenance team.' });
    } finally {
        conn.release();
    }
});

app.patch('/api/complaints/:complaintId/status', async (req, res) => {
    const { complaintId } = req.params;
    const { status: newStatus, remarks } = req.body;
    const allowed = ['Pending', 'Assigned', 'In Progress', 'Resolved'];

    if (!allowed.includes(newStatus)) {
        return res.status(400).json({ error: 'Invalid status value.' });
    }

    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [complaints] = await conn.query(
            'SELECT * FROM Complaints WHERE complaint_id = ? LIMIT 1',
            [complaintId]
        );
        if (complaints.length === 0) {
            await conn.rollback();
            return res.status(404).json({ error: 'Complaint not found.' });
        }

        const complaint = complaints[0];
        const [assignments] = await conn.query(
            'SELECT assignment_id FROM Assignments WHERE complaint_id = ? LIMIT 1',
            [complaintId]
        );

        if (newStatus !== 'Pending' && assignments.length === 0) {
            await conn.rollback();
            return res.status(400).json({ error: 'Assign a maintenance team first.' });
        }

        const timestamp = nowFormatted();
        const historyId = createID('HIS');

        await conn.query(
            `INSERT INTO Complaint_Status_History (
                history_id, complaint_id, old_status, new_status, updated_by, remarks, updated_at
            ) VALUES (?, ?, ?, ?, 'Admin', ?, ?)`,
            [
                historyId,
                complaintId,
                complaint.status,
                newStatus,
                remarks || 'Complaint status updated.',
                timestamp
            ]
        );

        await conn.query(
            'UPDATE Complaints SET status = ? WHERE complaint_id = ?',
            [newStatus, complaintId]
        );

        await conn.commit();
        res.json({ message: 'Complaint status and response saved!' });
    } catch (err) {
        await conn.rollback();
        console.error('PATCH /api/complaints/:complaintId/status error:', err);
        res.status(500).json({ error: 'Failed to update complaint status.' });
    } finally {
        conn.release();
    }
});

app.post('/api/contact', async (req, res) => {
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
        return res.status(400).json({ error: 'Name, email, and message are required.' });
    }

    try {
        await pool.query(
            'INSERT INTO Contact_Messages (name, email, message, created_at) VALUES (?, ?, ?, ?)',
            [name, email, message, nowFormatted()]
        );
        res.status(201).json({ message: 'Message saved successfully!' });
    } catch (err) {
        console.error('POST /api/contact error:', err);
        res.status(500).json({ error: 'Failed to save message.' });
    }
});

app.listen(PORT, () => {
    console.log(`AquaCare server running at http://localhost:${PORT}`);
});