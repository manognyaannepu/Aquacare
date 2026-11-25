const el = id => document.getElementById(id);
const val = id => el(id)?.value.trim() || "";

const escapeHTML = value => String(value ?? "").replace(
    /[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
);

const safe = escapeHTML;

let toastTimer;
let adminCache = {
    complaints: [],
    residents: [],
    areas: [],
    teams: [],
    assignments: [],
    reports: [],
    history: [],
    messages: []
};

function toast(message) {
    el("toast").textContent = message;
    el("toast").classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        el("toast").classList.remove("show");
    }, 3500);
}

function isAdmin() {
    return sessionStorage.getItem("aquacareAdmin") === "yes";
}

function requireAdmin() {
    if (!isAdmin()) {
        location.hash = "login";
        return false;
    }
    return true;
}

function navigate() {
    let page = location.hash.slice(1) || "home";
    const pages = ["home", "report", "track", "about", "contact", "login", "admin"];

    if (!pages.includes(page)) page = "home";
    if (page === "admin" && !isAdmin()) page = "login";
    if (page === "login" && isAdmin()) page = "admin";

    document.querySelectorAll(".page").forEach(p => {
        p.classList.toggle("active", p.id === page);
    });

    if (page === "admin") {
        loadAdminData();
    }

    window.scrollTo(0, 0);
}

window.addEventListener("hashchange", navigate);

const hero = document.querySelector(".hero");

if (hero) {
    for (let i = 0; i < 25; i++) {
        const bubble = document.createElement("span");
        const size = Math.random() * 45 + 8;

        bubble.className = "bubble";
        bubble.style.width = size + "px";
        bubble.style.height = size + "px";
        bubble.style.left = Math.random() * 100 + "%";
        bubble.style.animationDuration = Math.random() * 8 + 5 + "s";
        bubble.style.animationDelay = Math.random() * 10 + "s";

        hero.appendChild(bubble);
    }
}

const cards = document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("visible");
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: .1 });

    cards.forEach(card => observer.observe(card));
} else {
    cards.forEach(card => card.classList.add("visible"));
}

function getLocation() {
    if (!navigator.geolocation) {
        toast("GPS is not supported by this browser.");
        return;
    }

    el("gpsMessage").textContent = "Detecting location...";

    navigator.geolocation.getCurrentPosition(position => {
        el("latitude").value = position.coords.latitude.toFixed(7);
        el("longitude").value = position.coords.longitude.toFixed(7);
        el("gpsMessage").textContent = "Location captured successfully.";
        toast("GPS location captured!");
    }, () => {
        el("gpsMessage").textContent =
            "Unable to get GPS location. Enter coordinates manually or leave blank.";
    }, { enableHighAccuracy: true, timeout: 15000 });
}

el("reportForm").addEventListener("submit", async function (e) {
    e.preventDefault();

    const file = el("photo").files[0];

    if (file && (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type)
        || file.size > 1024 * 1024
    )) {
        toast("Choose a JPG, PNG or WebP image under 1 MB.");
        return;
    }

    el("reportSubmit").disabled = true;

    try {
        let imagePath = null;

        if (file) {
            imagePath = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }

        const payload = {
            residentName: val("residentName"),
            phone: val("phone"),
            email: val("email"),
            areaName: val("area"),
            city: val("city"),
            pincode: val("pincode"),
            complaintType: val("complaintType"),
            locationDetails: val("locationDetails"),
            latitude: val("latitude"),
            longitude: val("longitude"),
            description: val("description"),
            priority: val("priority"),
            imagePath
        };

        const res = await fetch("/api/complaints", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await res.json();

        if (!res.ok) {
            toast(data.error || "Unable to submit complaint.");
            return;
        }

        el("generatedID").textContent = data.complaint_id;
        el("trackID").value = data.complaint_id;
        el("trackPhone").value = payload.phone;

        el("reportForm").hidden = true;
        el("reportSuccess").hidden = false;

        toast("Complaint submitted to MySQL successfully!");
    } catch (error) {
        console.error(error);
        toast("Server error while submitting complaint.");
    } finally {
        el("reportSubmit").disabled = false;
    }
});

function resetReport() {
    el("reportForm").reset();
    el("reportSuccess").hidden = true;
    el("reportForm").hidden = false;
}

async function copyID() {
    try {
        await navigator.clipboard.writeText(el("generatedID").textContent);
        toast("Complaint ID copied!");
    } catch (error) {
        toast("Please copy the complaint ID manually.");
    }
}

function statusBadge(status) {
    const statuses = ["Pending", "Assigned", "In Progress", "Resolved"];
    const value = statuses.includes(status) ? status : "Pending";
    return `<span class="status ${value.replaceAll(" ", "-")}">${safe(value)}</span>`;
}

function timelineHTML(history) {
    if (!history || !history.length) return "<p>No history available.</p>";

    return `<div class="timeline">
        ${history.map(h => `
            <div class="timeline-item">
                <strong>${safe(h.new_status)}</strong>
                <p>${safe(h.remarks || "Status updated.")}</p>
                <small>${safe(h.updated_by)} · ${safe(h.updated_at)}</small>
            </div>
        `).join("")}
    </div>`;
}

el("trackForm").addEventListener("submit", async function (e) {
    e.preventDefault();

    const id = val("trackID").toUpperCase();
    const phone = val("trackPhone");
    const result = el("trackResult");
    result.hidden = false;

    try {
        const res = await fetch(
            `/api/complaints/track?id=${encodeURIComponent(id)}&phone=${encodeURIComponent(phone)}`
        );
        const data = await res.json();

        if (!res.ok) {
            result.innerHTML = `<p style='color:red;margin-top:20px'>${safe(data.error || "Complaint not found.")}</p>`;
            return;
        }

        const c = data.complaint;

        result.innerHTML = `
            <div class="panel details">
                <h2>Complaint Information</h2>
                <p><b>ID:</b> ${safe(c.complaint_id)}</p>
                <p><b>Problem:</b> ${safe(c.complaint_type)}</p>
                <p><b>Area:</b> ${safe(c.area_name || "-")}, ${safe(c.city || "-")}</p>
                <p><b>Status:</b> ${statusBadge(c.status)}</p>
                <p><b>Maintenance Team:</b> ${safe(data.team_name || "Not assigned")}</p>
                <p><b>Submitted:</b> ${safe(c.complaint_date)}</p>

                <br>
                <h2>Complaint Timeline</h2>
                ${timelineHTML(data.history)}
            </div>
        `;
    } catch (error) {
        console.error(error);
        result.innerHTML = "<p style='color:red;margin-top:20px'>Unable to reach server.</p>";
    }
});

function togglePassword(checkbox) {
    el("adminPassword").type = checkbox.checked ? "text" : "password";
}

el("loginForm").addEventListener("submit", async function (e) {
    e.preventDefault();

    try {
        const res = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: val("adminEmail"),
                password: val("adminPassword")
            })
        });

        const data = await res.json();

        if (res.ok && data.success) {
            sessionStorage.setItem("aquacareAdmin", "yes");
            el("loginError").textContent = "";
            this.reset();
            location.hash = "admin";
            await loadAdminData();
            adminTab("overview");
            toast("Welcome, Administrator!");
        } else {
            el("loginError").textContent = data.error || "Invalid email or password.";
        }
    } catch (error) {
        el("loginError").textContent = "Server error during login.";
    }
});

function adminTab(id) {
    if (!requireAdmin()) return;

    document.querySelectorAll(".admin-tab").forEach(tab => {
        tab.classList.toggle("active", tab.id === id);
    });

    document.querySelectorAll(".sidebar button").forEach(button => {
        button.classList.toggle("selected", button.dataset.tab === id);
    });

    renderAdmin();
}

function animateNumber(id, target) {
    const node = el(id);
    if (!node) return;

    if (node.animationFrame) {
        cancelAnimationFrame(node.animationFrame);
    }

    const start = Number(node.textContent) || 0;
    const started = performance.now();

    function frame(time) {
        const progress = Math.min((time - started) / 500, 1);
        node.textContent = Math.round(start + (target - start) * progress);

        if (progress < 1) {
            node.animationFrame = requestAnimationFrame(frame);
        }
    }

    node.animationFrame = requestAnimationFrame(frame);
}

async function loadAdminData() {
    if (!isAdmin()) return;

    try {
        const res = await fetch("/api/admin/dashboard");
        if (!res.ok) return;
        adminCache = await res.json();
        renderAdmin();
    } catch (error) {
        console.error(error);
        toast("Failed to load dashboard data from MySQL.");
    }
}

function renderAdmin() {
    if (!isAdmin()) return;

    const complaints = adminCache.complaints || [];

    const counts = [
        complaints.length,
        complaints.filter(c => c.status === "Pending").length,
        complaints.filter(c => c.status === "Assigned").length,
        complaints.filter(c => c.status === "In Progress").length,
        complaints.filter(c => c.status === "Resolved").length
    ];

    ["total", "pending", "assigned", "progress", "resolved"]
        .forEach((id, index) => animateNumber(id, counts[index]));

    el("statusChart").innerHTML =
        ["Pending", "Assigned", "In Progress", "Resolved"].map((status, i) => {
            const percent = complaints.length
                ? (counts[i + 1] / complaints.length) * 100
                : 0;

            return `
                <p style="margin:15px 0 6px">${status}: ${counts[i + 1]}</p>
                <div style="height:14px;background:#e0f2fe;border-radius:20px;overflow:hidden">
                    <div style="width:${percent}%;height:100%;background:linear-gradient(90deg,#06b6d4,#0284c7);border-radius:20px"></div>
                </div>
            `;
        }).join("");

    const search = val("search").toLowerCase();
    const filter = val("statusFilter");

    const filtered = complaints.filter(c => {
        const matches = [
            c.complaint_id, c.complaint_type, c.area_name, c.location_details
        ].some(x => String(x || "").toLowerCase().includes(search));

        return matches && (!filter || c.status === filter);
    });

    el("complaintRows").innerHTML = filtered.map(c => `
        <tr>
            <td>${safe(c.complaint_id)}</td>
            <td>${safe(c.complaint_type)}</td>
            <td>${safe(c.area_name || "-")}</td>
            <td>${safe(c.priority)}</td>
            <td>${statusBadge(c.status)}</td>
            <td><button class="small-btn" data-complaint="${safe(c.complaint_id)}">View</button></td>
        </tr>
    `).join("") || "<tr><td colspan='6'>No complaints found.</td></tr>";

    el("residentRows").innerHTML = (adminCache.residents || []).map(r => `
        <tr>
            <td>${safe(r.resident_id)}</td>
            <td>${safe(r.name)}</td>
            <td>${safe(r.phone)}</td>
            <td>${safe(r.email || "-")}</td>
        </tr>
    `).join("") || "<tr><td colspan='4'>No residents found.</td></tr>";

    el("areaRows").innerHTML = (adminCache.areas || []).map(a => `
        <tr>
            <td>${safe(a.area_id)}</td>
            <td>${safe(a.area_name)}</td>
            <td>${safe(a.city)}</td>
            <td>${safe(a.pincode)}</td>
        </tr>
    `).join("") || "<tr><td colspan='4'>No areas found.</td></tr>";

    el("teamRows").innerHTML = (adminCache.teams || []).map(t => `
        <tr>
            <td>${safe(t.team_id)}</td>
            <td>${safe(t.team_name)}</td>
            <td>${safe(t.team_leader)}</td>
            <td>${safe(t.phone)}</td>
            <td>${safe(t.availability)}</td>
            <td><button class="small-btn" data-team="${safe(t.team_id)}">Toggle Availability</button></td>
        </tr>
    `).join("") || "<tr><td colspan='6'>No maintenance teams found.</td></tr>";

    el("assignmentRows").innerHTML = (adminCache.assignments || []).map(a => `
        <tr>
            <td>${safe(a.assignment_id)}</td>
            <td>${safe(a.complaint_id)}</td>
            <td>${safe(a.team_name || a.team_id)}</td>
            <td>${safe(a.admin_id)}</td>
            <td>${safe(a.assigned_date)}</td>
        </tr>
    `).join("") || "<tr><td colspan='5'>No assignments found.</td></tr>";

    el("reportRows").innerHTML = (adminCache.reports || []).map(r => `
        <tr>
            <td>${safe(r.report_id)}</td>
            <td>${safe(r.complaint_id)}</td>
            <td>${safe(r.resident_name || "-")}</td>
            <td>${safe(r.report_date)}</td>
            <td>${safe(r.description)}</td>
        </tr>
    `).join("") || "<tr><td colspan='5'>No reports found.</td></tr>";

    el("historyContent").innerHTML = (adminCache.history || []).map(h => `
        <div class="timeline-item">
            <strong>${safe(h.complaint_id)}</strong>
            <p>${safe(h.old_status || "New")} → ${safe(h.new_status)}</p>
            <p>${safe(h.remarks)}</p>
            <small>${safe(h.updated_at)}</small>
        </div>
    `).join("") || "<p>No status history available.</p>";

    el("messageContent").innerHTML = (adminCache.messages || []).map(m => `
        <div class="timeline-item">
            <b>${safe(m.name)}</b>
            <p>${safe(m.email)}</p>
            <p>${safe(m.message)}</p>
        </div>
    `).join("") || "<p>No messages.</p>";
}

let selectedComplaint = null;

el("complaintRows").addEventListener("click", e => {
    const button = e.target.closest("[data-complaint]");
    if (button) openComplaint(button.dataset.complaint);
});

function openComplaint(id) {
    if (!requireAdmin()) return;

    const c = (adminCache.complaints || []).find(x => x.complaint_id === id);
    if (!c) return;

    selectedComplaint = id;

    el("detailContent").innerHTML = `
        <p><b>ID:</b> ${safe(c.complaint_id)}</p>
        <p><b>Resident:</b> ${safe(c.resident_name || "-")}</p>
        <p><b>Phone:</b> ${safe(c.resident_phone || "-")}</p>
        <p><b>Problem:</b> ${safe(c.complaint_type)}</p>
        <p><b>Area:</b> ${safe(c.area_name || "-")}, ${safe(c.city || "-")}</p>
        <p><b>Location:</b> ${safe(c.location_details)}</p>
        <p><b>GPS:</b> ${safe(c.latitude || "-")}, ${safe(c.longitude || "-")}</p>
        <p><b>Description:</b> ${safe(c.description)}</p>
        <p><b>Priority:</b> ${safe(c.priority)}</p>
        <p><b>Status:</b> ${statusBadge(c.status)}</p>
    `;

    if (c.image_path && /^data:image\/(jpeg|png|webp);base64,/.test(c.image_path)) {
        const image = document.createElement("img");
        image.src = c.image_path;
        image.alt = "Complaint photograph";
        el("detailContent").appendChild(image);
    }

    const availableTeams = (adminCache.teams || []).filter(t => t.availability === "Available");
    el("assignTeam").innerHTML =
        '<option value="">Select maintenance team</option>' +
        availableTeams.map(t =>
            `<option value="${safe(t.team_id)}">${safe(t.team_name)}</option>`
        ).join("");

    el("updateStatus").value = c.status;
    el("remarks").value = "";

    el("complaintDetails").hidden = false;
    el("complaintDetails").scrollIntoView({ behavior: "smooth" });
}

el("teamForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    if (!requireAdmin()) return;

    try {
        const res = await fetch("/api/teams", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                team_name: val("teamName"),
                team_leader: val("teamLeader"),
                phone: val("teamPhone"),
                availability: val("availability")
            })
        });

        const data = await res.json();
        if (!res.ok) {
            toast(data.error || "Could not add team.");
            return;
        }

        this.reset();
        await loadAdminData();
        toast("Maintenance team added!");
    } catch (error) {
        toast("Server error while adding team.");
    }
});

el("teamRows").addEventListener("click", async e => {
    const button = e.target.closest("[data-team]");
    if (!button || !requireAdmin()) return;

    try {
        const res = await fetch(`/api/teams/${encodeURIComponent(button.dataset.team)}/availability`, {
            method: "PATCH"
        });
        const data = await res.json();
        if (!res.ok) {
            toast(data.error || "Could not update availability.");
            return;
        }

        await loadAdminData();
        toast("Team availability updated.");
    } catch (error) {
        toast("Server error updating availability.");
    }
});

async function assignComplaint() {
    if (!requireAdmin()) return;

    const teamID = val("assignTeam");
    if (!teamID) {
        toast("Please select a maintenance team.");
        return;
    }

    try {
        const res = await fetch(`/api/complaints/${encodeURIComponent(selectedComplaint)}/assign`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ team_id: teamID })
        });

        const data = await res.json();
        if (!res.ok) {
            toast(data.error || "Could not assign team.");
            return;
        }

        await loadAdminData();
        openComplaint(selectedComplaint);
        toast("Maintenance team assigned successfully!");
    } catch (error) {
        toast("Server error assigning team.");
    }
}

async function updateComplaint() {
    if (!requireAdmin()) return;

    try {
        const res = await fetch(`/api/complaints/${encodeURIComponent(selectedComplaint)}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                status: val("updateStatus"),
                remarks: val("remarks")
            })
        });

        const data = await res.json();
        if (!res.ok) {
            toast(data.error || "Could not update status.");
            return;
        }

        await loadAdminData();
        el("complaintDetails").hidden = true;
        toast("Complaint status and response saved!");
    } catch (error) {
        toast("Server error updating status.");
    }
}

el("contactForm")?.addEventListener("submit", async function (e) {
    e.preventDefault();

    try {
        const res = await fetch("/api/contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                name: val("contactName"),
                email: val("contactEmail"),
                message: val("contactMessage")
            })
        });

        if (res.ok) {
            this.reset();
            toast("Message saved to database!");
        }
    } catch (error) {
        toast("Unable to send message.");
    }
});

function logout() {
    sessionStorage.removeItem("aquacareAdmin");
    el("logoutModal").hidden = true;
    el("complaintDetails").hidden = true;
    selectedComplaint = null;
    location.hash = "home";
    toast("Logged out successfully.");
}

navigate();