import { supabase } from "./supabase.js";

let currentUser = null;
let currentProfile = null;

const ROLE_LABELS = {
    account_manager: "Account Manager",
    engineer: "Engineer"
};

// Fetch the logged-in user's profile row (name + role) from Supabase.
async function loadProfile(userId){

    const {data, error} = await supabase
        .from("profiles")
        .select("full_name, role, email, created_at")
        .eq("id", userId)
        .single();

    if(error){
        console.error("Could not load profile:", error.message);
        return null;
    }

    currentProfile = data;
    return data;

}

// Replace the hardcoded identity across every page with the real user's name + role.
function applyUserIdentity(profile){

    if(!profile) return;

    const fullName = profile.full_name || "User";
    const roleLabel = ROLE_LABELS[profile.role] || "User";

    document.querySelectorAll(".user-name").forEach(el => {
        el.textContent = fullName;
    });

    document.querySelectorAll(".user-role").forEach(el => {
        el.textContent = roleLabel;
    });

    const welcome = document.querySelector(".welcome-heading");
    if(welcome){
        const firstName = fullName.split(" ")[0];
        welcome.textContent = `Good morning, ${firstName}`;
    }

    const amEmailField = document.getElementById("form-am-email");
    if (amEmailField) {
        amEmailField.value = profile.email || (currentUser && currentUser.email) || "";
    }

    applyRoleVisibility(profile.role);

}



async function signIn(){

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value.trim();

    const message = document.getElementById("login-message");


    if(!email || !password){
        message.textContent = "Please enter email and password";
        return;
    }


    const {data, error} = await supabase.auth.signInWithPassword({

        email,
        password

    });


    if(error){

        message.textContent = error.message;
        return;

    }


    currentUser = data.user;

    const profile = await loadProfile(currentUser.id);
    applyUserIdentity(profile);

    message.textContent = "Login successful";


    navigateTo("dashboard");

}
async function signUp(){

const name =
document.getElementById("signup-name").value.trim();


const email =
document.getElementById("signup-email").value.trim();


const password =
document.getElementById("signup-password").value;


const confirmPassword =
document.getElementById("signup-confirm-password").value;


const role =
document.getElementById("signup-role").value;


const message =
document.getElementById("signup-message");



if(password !== confirmPassword){

message.textContent="Passwords do not match";
return;

}



const {data,error}=await supabase.auth.signUp({

email,
password,

options:{
    data:{
        full_name:name,
        role
    }
}

});



if(error){

// The DB enforces at most one account_manager (unique index). Surface a friendly message.
if(/account manager/i.test(error.message) || /one_account_manager/i.test(error.message) || /duplicate key/i.test(error.message)){
message.textContent="An account manager already exists. Please sign up as an Engineer.";
}else if(/already registered/i.test(error.message) || /already exists/i.test(error.message) || /already been registered/i.test(error.message)){
message.textContent="An account with this email already exists. Please sign in instead.";
}else{
message.textContent=error.message;
}
return;

}


// Supabase does NOT error when the email already exists (anti-enumeration).
// It returns a user with an empty identities array and creates nothing.
if(data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0){

message.textContent="An account with this email already exists. Please sign in instead.";
return;

}


message.textContent="Account created. Check your email.";

}
// --- 2. GLOBAL STATE INITIALIZATION ---
// Populated from Supabase by loadRequests(); starts empty.
let pocRequests = [];

// Fetch the logged-in user's PoC requests from Supabase into pocRequests.
async function loadRequests() {
  const { data, error } = await supabase
    .from("poc_requests")
    .select("ticket, client, project, engineer, avatar, start_date, end_date, status, priority, created_at, objectives, resources, notes, engineer_id")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Could not load PoC requests:", error.message);
    pocRequests = [];
    return;
  }

  pocRequests = data.map(row => ({
    id: row.ticket,
    client: row.client,
    project: row.project,
    engineer: row.engineer || "Unassigned",
    avatar: row.avatar || "NA",
    start: row.start_date || "TBD",
    end: row.end_date || "TBD",
    status: row.status,
    priority: row.priority,
    createdAt: row.created_at,
    objectives: row.objectives || "",
    resources: Array.isArray(row.resources) ? row.resources : [],
    notes: row.notes || "",
    engineerId: row.engineer_id
  }));
}

const statusBadges = {
  "New Request": "badge-blue",
  "Infrastructure Provisioning": "badge-orange",
  "In Testing": "badge-purple",
  "Completed": "badge-green",
  "Decommissioned": "badge-gray"
};

const kanbanStyles = {
  "New Request": { accent: "card-accent-blue", badge: "kanban-badge-blue", label: "New" },
  "Infrastructure Provisioning": { accent: "card-accent-orange", badge: "kanban-badge-orange", label: "Provisioning" },
  "In Testing": { accent: "card-accent-purple", badge: "kanban-badge-purple", label: "Testing" },
  "Completed": { accent: "card-accent-green", badge: "kanban-badge-green", label: "Done", extraClass: "kanban-card-dim" },
  "Decommissioned": { accent: "card-accent-gray", badge: "kanban-badge-gray", label: "Archived", extraClass: "kanban-card-arch" }
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function formatId(index) {
  return `POC-2025-${String(index).padStart(3, "0")}`;
}

function normalizePriority(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("critical")) return "High";
  if (text.includes("high")) return "High";
  if (text.includes("low")) return "Low";
  return "Medium";
}

function priorityClass(priority) {
  if (priority === "High") return "kanban-priority-high";
  if (priority === "Low") return "kanban-priority-std";
  return "kanban-priority-std";
}

// --- 3. GLOBAL VIEW PAGE ROUTER ---
async function navigateTo(page) {
  // Close the mobile drawer when navigating.
  document.body.classList.remove("sidebar-open");

  document.querySelectorAll(".page").forEach(pageEl => pageEl.classList.remove("active"));

  const target = document.getElementById(`page-${page}`);
  if (target) {
    target.classList.add("active");
    window.scrollTo({ top: 0, behavior: "auto" });
  }

  document.querySelectorAll(".sidebar-nav .nav-item").forEach(item => {
    const clickAttr = item.getAttribute("onclick") || "";
    item.classList.toggle("active", clickAttr.includes(`'${page}'`) || clickAttr.includes(`"${page}"`));
  });

  if (page === "dashboard") {
    await loadRequests();
    const filterSelect = document.querySelector(".filter-select");
    renderDashboardTable(filterSelect ? filterSelect.value : "All Statuses");
    calculateStats();
  }

  if (page === "kanban") {
    await loadRequests();
    renderKanbanBoard();
  }

  if (page === "details") {
    if (!pocRequests.length) await loadRequests();
    renderDetails();
  }

  if (page === "engineers") {
    await Promise.all([loadEngineers(), loadRequests()]);
    renderEngineers();
  }

  if (page === "reports") {
    await Promise.all([loadRequests(), loadEngineers()]);
    renderReports();
  }

  if (page === "settings") {
    renderSettings();
  }
}

// --- 4. DYNAMIC MULTI-STEP RESOURCE ROWS ---
function addResourceRow() {
  const tbody = document.getElementById("resource-rows");
  if (!tbody) return;

  const row = document.createElement("tr");
  row.className = "resource-row";
  row.innerHTML = `
    <td>
      <select class="form-input form-select resource-select">
        <option>Virtual Machine</option>
        <option>Physical Server Hardware</option>
        <option>SAN/NAS Storage</option>
        <option>Cisco Networking/Switch</option>
        <option>Software Evaluation License</option>
      </select>
    </td>
    <td>
      <textarea class="form-input form-textarea resource-spec" rows="2" placeholder="Describe specifications"></textarea>
    </td>
    <td>
      <input type="number" class="form-input resource-qty" value="1" min="1" />
    </td>
    <td>
      <button type="button" class="btn-remove" onclick="removeRow(this)">x</button>
    </td>
  `;
  tbody.appendChild(row);
}

function removeRow(button) {
  const row = button.closest("tr");
  if (row) row.remove();
}

// --- 5. FORM INGESTION & WORKFLOW ROUTING ---
function initializeFormHandler() {
  const formPage = document.getElementById("page-form");
  const submitBtn = document.querySelector("#page-form .form-actions-right .btn-primary");
  if (!formPage || !submitBtn) return;

  submitBtn.removeAttribute("onclick");
  submitBtn.addEventListener("click", async event => {
    event.preventDefault();

    const textInputs = formPage.querySelectorAll('input[type="text"]');
    const emailInput = formPage.querySelector('input[type="email"]');
    const dateInputs = formPage.querySelectorAll('input[type="date"]');
    const selects = formPage.querySelectorAll("select.form-select");

    const clientNameInput = textInputs[0];
    const projectNameInput = textInputs[1];
    const clientName = clientNameInput ? clientNameInput.value.trim() : "";
    const projectName = projectNameInput ? projectNameInput.value.trim() : "";

    if (!clientName || !projectName) {
      alert("Please complete the required fields: Client Name and Project Name.");
      return;
    }

    const priority = normalizePriority(selects[1] ? selects[1].value : "Medium");
    const startDate = dateInputs[0] && dateInputs[0].value ? dateInputs[0].value : new Date().toISOString().slice(0, 10);
    const endDate = dateInputs[1] && dateInputs[1].value ? dateInputs[1].value : null;

    // Collect the dynamic resource rows.
    const resources = Array.from(formPage.querySelectorAll("#resource-rows .resource-row")).map(row => ({
      type: row.querySelector(".resource-select") ? row.querySelector(".resource-select").value : "",
      spec: row.querySelector(".resource-spec") ? row.querySelector(".resource-spec").value.trim() : "",
      qty: row.querySelector(".resource-qty") ? (parseInt(row.querySelector(".resource-qty").value, 10) || 1) : 1,
      status: "Pending"
    })).filter(r => r.spec);

    const objectivesEl = document.getElementById("form-objectives");
    const notesEl = document.getElementById("form-notes");
    const objectives = objectivesEl ? objectivesEl.value.trim() : "";
    const notes = notesEl ? notesEl.value.trim() : "";

    // Insert into Supabase. ticket + created_by are generated by the DB.
    submitBtn.disabled = true;
    const { data: inserted, error } = await supabase
      .from("poc_requests")
      .insert({
        client: clientName,
        project: projectName,
        engineer: "Unassigned",
        avatar: "NA",
        start_date: startDate,
        end_date: endDate,
        status: "New Request",
        priority,
        objectives,
        resources,
        notes
      })
      .select("ticket, client")
      .single();
    submitBtn.disabled = false;

    if (error) {
      alert("Could not submit request: " + error.message);
      return;
    }

    const ticketId = inserted.ticket;

    if (clientNameInput) clientNameInput.value = "";
    if (projectNameInput) projectNameInput.value = "";
    // Leave the Account Manager Email field alone — it reflects the logged-in user.

    const dynamicRows = document.getElementById("resource-rows");
    if (dynamicRows) dynamicRows.innerHTML = "";

   // --- SLEEK CUSTOM SUBMIT NOTIFICATION ---
    const submitToast = document.createElement('div');

    // Applying matching EdgeNet style properties
    submitToast.style.position = 'fixed';
    submitToast.style.top = '20px';
    submitToast.style.right = '20px';
    submitToast.style.backgroundColor = '#1e293b';
    submitToast.style.color = '#ffffff';
    submitToast.style.padding = '16px 24px';
    submitToast.style.borderRadius = '8px';
    submitToast.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.3)';
    submitToast.style.borderLeft = '4px solid #10b981'; // Premium green border for success
    submitToast.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    submitToast.style.zIndex = '10000';
    submitToast.style.transition = 'all 0.5s ease';

    submitToast.innerHTML = `
      <div style="font-weight: 600; margin-bottom: 4px; font-size: 15px;">🚀 Request Dispatched!</div>
      <div style="font-size: 13px; color: #cbd5e1;">Ticket <strong>${escapeHtml(ticketId)}</strong> for ${escapeHtml(inserted.client)} saved to Supabase.</div>
    `;

    document.body.appendChild(submitToast);

    // Smoothly transition views after 3 seconds
    setTimeout(() => {
      submitToast.style.opacity = '0';
      submitToast.style.transform = 'translateY(-20px)';

      setTimeout(() => submitToast.remove(), 500);

      // Return to dashboard overview list (reloads from DB)
      navigateTo("dashboard");
    }, 3000);
  });
}

// --- 6. RENDER OVERVIEW TABLE RECOGNITION (WITH LIVE FILTERING) ---
function renderDashboardTable(filterStatus = "All Statuses") {
  const tbody = document.querySelector(".data-table tbody");
  if (!tbody) return;

  const filteredList = pocRequests.filter(req => filterStatus === "All Statuses" || req.status === filterStatus);
  tbody.innerHTML = "";

  filteredList.forEach(req => {
    const tr = document.createElement("tr");
    tr.className = "table-row-link";
    tr.onclick = () => openDetails(req.id);

    const badgeClass = statusBadges[req.status] || "badge-gray";
    tr.innerHTML = `
      <td><span class="client-name">${escapeHtml(req.client)}</span></td>
      <td>${escapeHtml(req.project)}</td>
      <td><span class="engineer-cell"><span class="eng-avatar">${escapeHtml(req.avatar)}</span>${escapeHtml(req.engineer)}</span></td>
      <td>${escapeHtml(req.start)}</td>
      <td>${escapeHtml(req.end)}</td>
      <td><span class="badge ${badgeClass}">${escapeHtml(req.status)}</span></td>
      <td><span class="row-action">&rarr;</span></td>
    `;
    tbody.appendChild(tr);
  });

  const counterText = document.querySelector(".table-count");
  if (counterText) {
    counterText.textContent = `Showing ${filteredList.length} of ${pocRequests.length} records`;
  }
}

// --- 7. METRICS COMPUTATION ENGINE ---
function calculateStats() {
  const values = document.querySelectorAll(".stat-value");
  if (values.length < 4) return;

  const total = pocRequests.length;
  const active = pocRequests.filter(req => req.status === "Infrastructure Provisioning" || req.status === "In Testing").length;
  const completed = pocRequests.filter(req => req.status === "Completed").length;
  const pending = pocRequests.filter(req => req.status === "New Request").length;

  values[0].textContent = total;
  values[1].textContent = active;
  values[2].textContent = completed;
  values[3].textContent = pending;

  document.querySelectorAll(".nav-badge").forEach(badge => {
    badge.textContent = pending;
  });
}

// --- 7B. REQUEST DETAILS VIEW ---

// The ticket the user clicked; drives the details page.
let selectedTicket = null;

// Open the details page for a specific request.
function openDetails(ticket) {
  selectedTicket = ticket;
  navigateTo("details");
}

// Format an ISO date ("2025-02-15") or timestamp into "February 15, 2025".
function formatDate(value) {
  if (!value || value === "TBD") return "TBD";
  const date = new Date(value.length <= 10 ? value + "T00:00:00" : value);
  if (isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// Populate the (otherwise static) details page with the selected request.
function renderDetails() {
  // Fall back to the most recent request if the page was opened from the sidebar.
  const req = pocRequests.find(r => r.id === selectedTicket) || pocRequests[0];

  const fields = document.getElementById("detail-fields");

  if (!req) {
    if (fields) {
      fields.innerHTML = `<p class="detail-prose">No requests yet. Create one from “New PoC Request”.</p>`;
    }
    return;
  }

  const badgeClass = statusBadges[req.status] || "badge-gray";
  const amName = (currentProfile && currentProfile.full_name) || "Account Manager";

  // Breadcrumb + status banner
  const breadcrumbId = document.getElementById("detail-breadcrumb-id");
  if (breadcrumbId) breadcrumbId.textContent = `#${req.id}`;

  const bannerId = document.getElementById("detail-banner-id");
  if (bannerId) bannerId.textContent = `#${req.id}`;

  const bannerBadge = document.getElementById("detail-banner-badge");
  if (bannerBadge) {
    bannerBadge.className = `badge ${badgeClass}`;
    bannerBadge.textContent = req.status;
  }

  // Project Information card
  if (fields) {
    fields.innerHTML = `
      <div class="detail-field">
        <span class="detail-label">Client Name</span>
        <span class="detail-value detail-value-strong">${escapeHtml(req.client)}</span>
      </div>
      <div class="detail-field">
        <span class="detail-label">Project Name</span>
        <span class="detail-value">${escapeHtml(req.project)}</span>
      </div>
      <div class="detail-field">
        <span class="detail-label">Account Manager</span>
        <span class="detail-value"><img class="detail-avatar user-avatar-img" src="assests/profile.jpg" alt="${escapeHtml(amName)} profile picture">${escapeHtml(amName)}</span>
      </div>
      <div class="detail-field">
        <span class="detail-label">Assigned Engineer</span>
        <span class="detail-value"><span class="detail-avatar detail-avatar-eng">${escapeHtml(req.avatar)}</span>${escapeHtml(req.engineer)}</span>
      </div>
      <div class="detail-field">
        <span class="detail-label">Priority</span>
        <span class="detail-value"><span class="kanban-priority ${priorityClass(req.priority)}" style="font-size:11px">${escapeHtml(req.priority)}</span></span>
      </div>
      <div class="detail-field">
        <span class="detail-label">Start Date</span>
        <span class="detail-value">${escapeHtml(formatDate(req.start))}</span>
      </div>
      <div class="detail-field">
        <span class="detail-label">End Date</span>
        <span class="detail-value">${escapeHtml(formatDate(req.end))}</span>
      </div>
      <div class="detail-field">
        <span class="detail-label">Current Status</span>
        <span class="detail-value"><span class="badge ${badgeClass}">${escapeHtml(req.status)}</span></span>
      </div>
    `;
  }

  // "Request Submitted" timeline entry (the only one backed by real data)
  const submitDate = document.getElementById("detail-submit-date");
  if (submitDate) submitDate.textContent = req.createdAt ? formatDate(req.createdAt) : "—";

  const submitDesc = document.getElementById("detail-submit-desc");
  if (submitDesc) submitDesc.textContent = `PoC request #${req.id} submitted by ${amName}. Client: ${req.client}.`;

  // Resource Requirements table
  const resTbody = document.getElementById("detail-resources");
  if (resTbody) {
    const list = Array.isArray(req.resources) ? req.resources : [];
    if (!list.length) {
      resTbody.innerHTML = `<tr><td colspan="4" class="spec-cell">No resources specified for this request.</td></tr>`;
    } else {
      resTbody.innerHTML = list.map(r => {
        const st = r.status || "Pending";
        const stBadge = st === "Provisioned" ? "badge-green" : st === "Pending" ? "badge-orange" : "badge-gray";
        return `
          <tr>
            <td>${escapeHtml(r.type || "—")}</td>
            <td class="spec-cell">${escapeHtml(r.spec || "")}</td>
            <td>${escapeHtml(String(r.qty ?? ""))}</td>
            <td><span class="badge ${stBadge}">${escapeHtml(st)}</span></td>
          </tr>`;
      }).join("");
    }
  }

  // Project Objectives
  const objEl = document.getElementById("detail-objectives");
  if (objEl) objEl.textContent = req.objectives || "No objectives provided.";
  const tagsEl = document.getElementById("detail-objectives-tags");
  if (tagsEl) tagsEl.innerHTML = "";

  // Status banner action buttons (advance/retreat through the workflow)
  const actions = document.getElementById("detail-banner-actions");
  if (actions) {
    const flow = STATUS_BY_COLUMN;
    const i = flow.indexOf(req.status);
    let html = "";
    if (i > 0) {
      html += `<button class="btn-outline btn-sm" data-target="${escapeHtml(flow[i - 1])}">← Move to ${escapeHtml(flow[i - 1])}</button>`;
    }
    if (i >= 0 && i < flow.length - 1) {
      html += `<button class="btn-primary btn-sm" data-target="${escapeHtml(flow[i + 1])}">Move to ${escapeHtml(flow[i + 1])} →</button>`;
    }
    actions.innerHTML = html;

    actions.querySelectorAll("button[data-target]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const target = btn.getAttribute("data-target");
        btn.disabled = true;
        const ok = await updateRequestStatus(req.id, target);
        if (ok) {
          req.status = target;
          renderDetails();
        } else {
          btn.disabled = false;
          alert("Could not update status. Please try again.");
        }
      });
    });
  }
}

// --- 7E. SETTINGS ---

// Fill the settings page from the current profile/user.
function renderSettings() {
  const nameInput = document.getElementById("settings-name");
  if (nameInput) nameInput.value = (currentProfile && currentProfile.full_name) || "";

  const emailEl = document.getElementById("settings-email");
  if (emailEl) emailEl.textContent = (currentProfile && currentProfile.email) || (currentUser && currentUser.email) || "—";

  const roleEl = document.getElementById("settings-role");
  if (roleEl) roleEl.textContent = currentProfile ? (ROLE_LABELS[currentProfile.role] || currentProfile.role) : "—";

  const memberEl = document.getElementById("settings-member");
  if (memberEl) memberEl.textContent = currentProfile && currentProfile.created_at ? formatDate(currentProfile.created_at) : "—";

  const pm = document.getElementById("settings-profile-msg");
  if (pm) pm.textContent = "";
  const pwm = document.getElementById("settings-password-msg");
  if (pwm) pwm.textContent = "";
}

// Save the full name to the profiles table and refresh the identity everywhere.
async function saveProfile() {
  const nameInput = document.getElementById("settings-name");
  const msg = document.getElementById("settings-profile-msg");
  const btn = document.getElementById("settings-save-profile");
  if (!nameInput || !currentUser) return;

  const newName = nameInput.value.trim();
  if (!newName) {
    if (msg) msg.textContent = "Name cannot be empty.";
    return;
  }

  if (btn) btn.disabled = true;
  const { error } = await supabase
    .from("profiles")
    .update({ full_name: newName })
    .eq("id", currentUser.id);
  if (btn) btn.disabled = false;

  if (error) {
    if (msg) msg.textContent = "Could not save: " + error.message;
    return;
  }

  if (currentProfile) currentProfile.full_name = newName;
  applyUserIdentity(currentProfile);
  if (msg) msg.textContent = "Profile updated.";
}

// Update the account password via Supabase auth.
async function savePassword() {
  const pw = document.getElementById("settings-password");
  const confirmPw = document.getElementById("settings-password-confirm");
  const msg = document.getElementById("settings-password-msg");
  const btn = document.getElementById("settings-save-password");
  if (!pw || !confirmPw) return;

  const p1 = pw.value;
  const p2 = confirmPw.value;

  if (p1.length < 6) {
    if (msg) msg.textContent = "Password must be at least 6 characters.";
    return;
  }
  if (p1 !== p2) {
    if (msg) msg.textContent = "Passwords do not match.";
    return;
  }

  if (btn) btn.disabled = true;
  const { error } = await supabase.auth.updateUser({ password: p1 });
  if (btn) btn.disabled = false;

  if (error) {
    if (msg) msg.textContent = "Could not update password: " + error.message;
    return;
  }

  pw.value = "";
  confirmPw.value = "";
  if (msg) msg.textContent = "Password updated successfully.";
}

// --- 7D. REPORTS ---

// Render a set of horizontal bars (width relative to the largest count).
function renderBars(el, rows) {
  if (!el) return;
  if (!rows.length) {
    el.innerHTML = `<div class="report-empty">No data yet.</div>`;
    return;
  }
  const max = Math.max(1, ...rows.map(r => r.count));
  el.innerHTML = rows.map(r => {
    const pct = Math.round((r.count / max) * 100);
    const color = r.color || "var(--status-blue)";
    return `
      <div class="report-bar-row">
        <span class="report-bar-label">${escapeHtml(r.label)}</span>
        <span class="report-bar-track"><span class="report-bar-fill" style="width:${pct}%;background:${color}"></span></span>
        <span class="report-bar-count">${r.count}</span>
      </div>`;
  }).join("");
}

// Compute + render all report widgets from the loaded requests/engineers.
function renderReports() {
  const total = pocRequests.length;
  const active = pocRequests.filter(r => r.status === "Infrastructure Provisioning" || r.status === "In Testing").length;
  const completed = pocRequests.filter(r => r.status === "Completed").length;
  const rate = total ? Math.round((completed / total) * 100) : 0;

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText("report-total", total);
  setText("report-active", active);
  setText("report-completed", completed);
  setText("report-rate", rate + "%");

  const statusColors = {
    "New Request": "var(--status-blue)",
    "Infrastructure Provisioning": "var(--status-orange)",
    "In Testing": "var(--status-purple)",
    "Completed": "var(--status-green)",
    "Decommissioned": "var(--status-gray)"
  };
  const statusRows = STATUS_BY_COLUMN.map(s => ({
    label: s,
    count: pocRequests.filter(r => r.status === s).length,
    color: statusColors[s]
  }));
  renderBars(document.getElementById("report-status"), statusRows);

  const priorityColors = { High: "var(--status-orange)", Medium: "var(--status-blue)", Low: "var(--status-gray)" };
  const priorityRows = ["High", "Medium", "Low"].map(p => ({
    label: p,
    count: pocRequests.filter(r => r.priority === p).length,
    color: priorityColors[p]
  }));
  renderBars(document.getElementById("report-priority"), priorityRows);

  // Engineer workload
  const counts = {};
  pocRequests.forEach(r => { if (r.engineerId) counts[r.engineerId] = (counts[r.engineerId] || 0) + 1; });
  const workloadRows = engineersList.map(e => ({
    label: e.full_name || "Unnamed engineer",
    count: counts[e.id] || 0
  }));
  const unassigned = pocRequests.filter(r => !r.engineerId).length;
  if (unassigned) workloadRows.push({ label: "Unassigned", count: unassigned, color: "var(--status-gray)" });

  const workloadEl = document.getElementById("report-workload");
  if (workloadEl && !workloadRows.length) {
    workloadEl.innerHTML = `<div class="report-empty">No engineers or assignments yet.</div>`;
  } else {
    renderBars(workloadEl, workloadRows);
  }
}

// --- 7C. ENGINEER ASSIGNMENT & ROLE-BASED VISIBILITY ---

// All engineers (profiles with role 'engineer'); populated by loadEngineers().
let engineersList = [];

// Fetch the engineering team. Requires the account-manager profiles policy.
async function loadEngineers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, created_at")
    .eq("role", "engineer")
    .order("full_name");

  if (error) {
    console.error("Could not load engineers:", error.message);
    engineersList = [];
    return;
  }
  engineersList = data;
}

// Render the Engineers management table (name, email, PoC load, join date).
function renderEngineers() {
  const tbody = document.getElementById("engineers-tbody");
  const countEl = document.getElementById("engineers-count");
  if (!tbody) return;

  if (countEl) {
    countEl.textContent = `${engineersList.length} engineer${engineersList.length === 1 ? "" : "s"}`;
  }

  if (!engineersList.length) {
    tbody.innerHTML = `<tr><td colspan="4">No engineers registered yet. Engineers appear here once they sign up with the Engineer role.</td></tr>`;
    return;
  }

  // Count assigned requests per engineer from the loaded requests.
  const counts = {};
  pocRequests.forEach(req => {
    if (req.engineerId) counts[req.engineerId] = (counts[req.engineerId] || 0) + 1;
  });

  tbody.innerHTML = engineersList.map(eng => {
    const name = eng.full_name || "Unnamed engineer";
    const load = counts[eng.id] || 0;
    return `
      <tr>
        <td><span class="engineer-cell"><span class="eng-avatar">${escapeHtml(initials(name))}</span>${escapeHtml(name)}</span></td>
        <td>${escapeHtml(eng.email || "—")}</td>
        <td>${load}</td>
        <td>${escapeHtml(formatDate(eng.created_at))}</td>
      </tr>`;
  }).join("");
}

// Build 2-letter initials for an avatar chip.
function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).map(w => w[0]).filter(Boolean);
  return (parts.slice(0, 2).join("") || "NA").toUpperCase();
}

// Show/hide account-manager-only controls based on the current user's role.
function applyRoleVisibility(role) {
  const isAM = role === "account_manager";

  // Anything that opens the New PoC Request form is account-manager-only.
  document.querySelectorAll("[onclick]").forEach(el => {
    if ((el.getAttribute("onclick") || "").includes("navigateTo('form')")) {
      el.style.display = isAM ? "" : "none";
    }
  });

  // Explicitly tagged AM-only controls (e.g. Assign Engineer).
  document.querySelectorAll(".am-only").forEach(el => {
    el.style.display = isAM ? "" : "none";
  });
}

// Open the Assign Engineer modal for the currently selected request.
async function openAssignModal() {
  const modal = document.getElementById("assign-modal");
  const select = document.getElementById("assign-engineer-select");
  const ticketLabel = document.getElementById("assign-modal-ticket");
  const msg = document.getElementById("assign-modal-msg");
  if (!modal || !select || !selectedTicket) return;

  if (msg) msg.textContent = "";
  if (ticketLabel) ticketLabel.textContent = `#${selectedTicket}`;
  select.innerHTML = `<option value="">Loading engineers…</option>`;
  modal.style.display = "flex";

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "engineer")
    .order("full_name");

  if (error) {
    select.innerHTML = "";
    if (msg) msg.textContent = "Could not load engineers: " + error.message;
    return;
  }

  if (!data.length) {
    select.innerHTML = `<option value="">No engineers registered yet</option>`;
    return;
  }

  select.innerHTML = data
    .map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.full_name || "Unnamed engineer")}</option>`)
    .join("");
}

function closeAssignModal() {
  const modal = document.getElementById("assign-modal");
  if (modal) modal.style.display = "none";
}

// Persist the chosen engineer to the selected request.
async function confirmAssignEngineer() {
  const select = document.getElementById("assign-engineer-select");
  const msg = document.getElementById("assign-modal-msg");
  const confirmBtn = document.getElementById("assign-confirm");
  if (!select || !selectedTicket) return;

  const engineerId = select.value;
  const engineerName = select.selectedIndex >= 0 ? select.options[select.selectedIndex].text : "";
  if (!engineerId) {
    if (msg) msg.textContent = "Please select an engineer.";
    return;
  }

  if (confirmBtn) confirmBtn.disabled = true;
  const { error } = await supabase
    .from("poc_requests")
    .update({ engineer_id: engineerId, engineer: engineerName, avatar: initials(engineerName) })
    .eq("ticket", selectedTicket);
  if (confirmBtn) confirmBtn.disabled = false;

  if (error) {
    if (msg) msg.textContent = "Could not assign: " + error.message;
    return;
  }

  const req = pocRequests.find(r => r.id === selectedTicket);
  if (req) {
    req.engineer = engineerName;
    req.avatar = initials(engineerName);
    req.engineerId = engineerId;
  }
  closeAssignModal();
  renderDetails();
}

// --- 8. LIVE BOARD STREAM DESIGN (KANBAN INTERFACE) ---

// Column order in the HTML → the status each column represents.
const STATUS_BY_COLUMN = [
  "New Request",
  "Infrastructure Provisioning",
  "In Testing",
  "Completed",
  "Decommissioned"
];

// True while a card is being dragged, so the trailing click doesn't open details.
let kanbanDragging = false;

// Persist a status change for one request to Supabase.
async function updateRequestStatus(ticket, status) {
  const { error } = await supabase
    .from("poc_requests")
    .update({ status })
    .eq("ticket", ticket);

  if (error) {
    console.error("Could not update status:", error.message);
    return false;
  }
  return true;
}

// Wire each kanban column as a drop target. Runs once on load.
function setupKanbanDnd() {
  const cols = document.querySelectorAll("#page-kanban .kanban-col");

  cols.forEach((col, index) => {
    const dropZone = col.querySelector(".kanban-cards");
    if (!dropZone) return;

    dropZone.dataset.status = STATUS_BY_COLUMN[index] || "";

    dropZone.addEventListener("dragover", event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      dropZone.classList.add("kanban-drop-active");
    });

    dropZone.addEventListener("dragleave", () => {
      dropZone.classList.remove("kanban-drop-active");
    });

    dropZone.addEventListener("drop", async event => {
      event.preventDefault();
      dropZone.classList.remove("kanban-drop-active");

      const ticket = event.dataTransfer.getData("text/plain");
      const newStatus = dropZone.dataset.status;
      if (!ticket || !newStatus) return;

      const req = pocRequests.find(r => r.id === ticket);
      if (!req || req.status === newStatus) return;

      // Optimistic update: move the card immediately, then persist.
      const previousStatus = req.status;
      req.status = newStatus;
      renderKanbanBoard();

      const ok = await updateRequestStatus(ticket, newStatus);
      if (!ok) {
        req.status = previousStatus;
        renderKanbanBoard();
        alert("Could not move the request. Please try again.");
      }
    });
  });
}

function renderKanbanBoard() {
  const columns = {
    "New Request": document.querySelector(".kanban-col:nth-child(1) .kanban-cards"),
    "Infrastructure Provisioning": document.querySelector(".kanban-col:nth-child(2) .kanban-cards"),
    "In Testing": document.querySelector(".kanban-col:nth-child(3) .kanban-cards"),
    "Completed": document.querySelector(".kanban-col:nth-child(4) .kanban-cards"),
    "Decommissioned": document.querySelector(".kanban-col:nth-child(5) .kanban-cards")
  };

  Object.values(columns).forEach(column => {
    if (column) column.innerHTML = "";
  });

  pocRequests.forEach(req => {
    const targetCol = columns[req.status];
    if (!targetCol) return;

    const style = kanbanStyles[req.status] || kanbanStyles["Decommissioned"];
    const card = document.createElement("div");
    card.className = `kanban-card ${style.extraClass || ""}`.trim();
    card.draggable = true;
    card.dataset.ticket = req.id;
    card.addEventListener("dragstart", event => {
      kanbanDragging = true;
      card.classList.add("kanban-card-dragging");
      event.dataTransfer.setData("text/plain", req.id);
      event.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("kanban-card-dragging");
      // Let the click that may follow a drag be ignored, then reset.
      setTimeout(() => { kanbanDragging = false; }, 0);
    });
    card.onclick = () => {
      if (kanbanDragging) return;
      openDetails(req.id);
    };

    const footerStatus = req.status === "Completed"
      ? '<span class="kanban-check">Approved</span>'
      : req.status === "Decommissioned"
        ? '<span class="kanban-arch-label">Decommissioned</span>'
        : `<span class="kanban-priority ${priorityClass(req.priority)}">${escapeHtml(req.priority)}</span>`;

    const dateLabel = req.status === "Completed" || req.status === "Decommissioned" ? "Ended" : "Due";

    card.innerHTML = `
      <div class="card-top-accent ${style.accent}"></div>
      <div class="kanban-card-header">
        <span class="kanban-badge ${style.badge}">${escapeHtml(style.label)}</span>
        <span class="kanban-card-id">#${escapeHtml(req.id)}</span>
      </div>
      <h5 class="kanban-card-project">${escapeHtml(req.project)}</h5>
      <p class="kanban-card-client">${escapeHtml(req.client)}</p>
      <div class="kanban-card-meta">
        <span class="meta-row">${dateLabel}: ${escapeHtml(req.end)}</span>
      </div>
      <div class="kanban-card-footer">
        <div class="kanban-eng"><span class="kanban-eng-avatar">${escapeHtml(req.avatar)}</span><span>${escapeHtml(req.engineer)}</span></div>
        ${footerStatus}
      </div>
    `;
    targetCol.appendChild(card);
  });

  document.querySelectorAll(".kanban-col").forEach(col => {
    const countEl = col.querySelector(".kanban-col-count");
    if (countEl) countEl.textContent = col.querySelectorAll(".kanban-card").length;
  });
}

// --- 8B. SIDEBAR COLLAPSE ---
// Inject a collapse toggle into every sidebar and remember the choice.
// The collapsed state lives on <body> so it applies to whichever page's
// sidebar is currently shown and persists across navigation.
function setupSidebarToggle() {
  if (localStorage.getItem("sidebarCollapsed") === "1") {
    document.body.classList.add("sidebar-collapsed");
  }

  document.querySelectorAll(".sidebar").forEach(sidebar => {
    if (sidebar.querySelector(".sidebar-toggle")) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sidebar-toggle";
    btn.setAttribute("aria-label", "Collapse or expand sidebar");
    btn.title = "Collapse / expand";
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M12 5l-5 5 5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

    btn.addEventListener("click", () => {
      const collapsed = document.body.classList.toggle("sidebar-collapsed");
      localStorage.setItem("sidebarCollapsed", collapsed ? "1" : "0");
    });

    sidebar.insertBefore(btn, sidebar.firstChild);
  });
}

// --- 8C. RESPONSIVE / MOBILE NAV ---
// On small screens the sidebar becomes an off-canvas drawer. Inject a
// hamburger button into every topbar and a single backdrop; toggling
// body.sidebar-open slides the drawer in/out (CSS handles the rest).
function setupResponsiveNav() {
  let backdrop = document.querySelector(".nav-backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "nav-backdrop";
    backdrop.addEventListener("click", () => document.body.classList.remove("sidebar-open"));
    document.body.appendChild(backdrop);
  }

  document.querySelectorAll(".topbar").forEach(topbar => {
    if (topbar.querySelector(".nav-hamburger")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "nav-hamburger";
    btn.setAttribute("aria-label", "Open navigation menu");
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    btn.addEventListener("click", () => document.body.classList.toggle("sidebar-open"));
    topbar.insertBefore(btn, topbar.firstChild);
  });
}

// --- 9. INITIAL APPLICATION DOM BINDINGS ---
document.addEventListener("DOMContentLoaded", () => {
  const filterSelect = document.querySelector(".filter-select");
  if (filterSelect) {
    filterSelect.addEventListener("change", event => {
      renderDashboardTable(event.target.value);
    });
  }

  initializeFormHandler();
  setupKanbanDnd();
  setupSidebarToggle();
  setupResponsiveNav();
  calculateStats();
  renderDashboardTable();

  // Assign Engineer modal wiring
  const assignBtn = document.getElementById("assignEngineerBtn");
  if (assignBtn) assignBtn.addEventListener("click", openAssignModal);

  const assignCancel = document.getElementById("assign-cancel");
  if (assignCancel) assignCancel.addEventListener("click", closeAssignModal);

  const assignConfirm = document.getElementById("assign-confirm");
  if (assignConfirm) assignConfirm.addEventListener("click", confirmAssignEngineer);

  const assignModal = document.getElementById("assign-modal");
  if (assignModal) {
    // Click on the dark overlay (outside the card) closes the modal.
    assignModal.addEventListener("click", event => {
      if (event.target === assignModal) closeAssignModal();
    });
  }

  // Settings page actions
  const saveProfileBtn = document.getElementById("settings-save-profile");
  if (saveProfileBtn) saveProfileBtn.addEventListener("click", saveProfile);

  const savePasswordBtn = document.getElementById("settings-save-password");
  if (savePasswordBtn) savePasswordBtn.addEventListener("click", savePassword);
});

// Supabase appends auth errors (e.g. expired email links) to the URL hash.
// Detect them, show a friendly note on the login page, and clean the URL.
function handleAuthErrorHash() {
  const hash = window.location.hash || "";
  if (!hash.includes("error")) return;

  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const code = params.get("error_code");
  const desc = params.get("error_description");
  if (!params.get("error") && !code) return;

  const message = document.getElementById("login-message");
  if (message) {
    message.textContent = code === "otp_expired"
      ? "That email link has expired. Please sign in, or request a new link."
      : (desc ? decodeURIComponent(desc.replace(/\+/g, " ")) : "Authentication link was invalid.");
  }

  // Strip the error hash so it doesn't linger in the address bar.
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

handleAuthErrorHash();

const signInBtn = document.getElementById("signInBtn");

if(signInBtn){

signInBtn.addEventListener(
"click",
signIn
);

}



const signUpBtn = document.getElementById("signUpBtn");

if(signUpBtn){

signUpBtn.addEventListener(
"click",
signUp
);

}

window.navigateTo = navigateTo;
window.addResourceRow = addResourceRow;
window.removeRow = removeRow;



// --- 10. VISUAL MOCKUP FOR SAVE DRAFT ---
document.addEventListener("DOMContentLoaded", () => {
  const saveDraftBtn = document.getElementById('saveDraftBtn');
  
  if (saveDraftBtn) {
    saveDraftBtn.addEventListener('click', (event) => {
      event.preventDefault(); // Stops the page from breaking or reloading
      
      // 1. Create a beautiful, custom corporate notification container
      const notification = document.createElement('div');
      
      // Apply professional inline styles to match your EdgeNet portal theme
      notification.style.position = 'fixed';
      notification.style.top = '20px';
      notification.style.right = '20px';
      notification.style.backgroundColor = '#1e293b'; // Sleek dark slate corporate color
      notification.style.color = '#ffffff';
      notification.style.padding = '16px 24px';
      notification.style.borderRadius = '8px';
      notification.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.3)';
      notification.style.borderLeft = '4px solid #0056b3'; // Matches your professional blue buttons
      notification.style.fontFamily = 'system-ui, -apple-system, sans-serif';
      notification.style.zIndex = '10000';
      notification.style.transition = 'all 0.5s ease';
      
      // Add the text content inside the toast
      notification.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 4px; font-size: 15px;">💾 Draft Saved!</div>
        <div style="font-size: 13px; color: #cbd5e1;">Your progress has been preserved in the internal EdgeNet system.</div>
      `;
      
      // 2. Append it directly to your page layout
      document.body.appendChild(notification);
      
      // 3. Smoothly fade away and switch views after 3 seconds
      setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(-20px)';
        
        // Remove the element from memory once hidden
        setTimeout(() => notification.remove(), 500);
        
        // Transition back to the dashboard summary list
        navigateTo('dashboard');
      }, 3000);
    });

  }
});

// --- AUTH BUTTON CONNECTIONS ---
document.addEventListener("DOMContentLoaded", () => {


    const signInBtn = document.getElementById("signInBtn");

    if(signInBtn){

        signInBtn.addEventListener("click", () => {

            signIn();

        });

    }



    const signUpBtn = document.getElementById("signUpBtn");

    if(signUpBtn){

        signUpBtn.addEventListener("click", () => {

            signUp();

        });

    }



});// --- CHECK EXISTING LOGIN SESSION ---
async function checkSession(){

    const {data} = await supabase.auth.getSession();


    if(data.session){

        currentUser = data.session.user;

        const profile = await loadProfile(currentUser.id);
        applyUserIdentity(profile);

        navigateTo("dashboard");

    }

}


checkSession();