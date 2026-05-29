const views = document.querySelectorAll("[data-view]");
const viewLinks = document.querySelectorAll("[data-view-link]");
const staffOnlyElements = document.querySelectorAll(".staff-only");
const loginButton = document.querySelector("#loginButton");
const profileMenu = document.querySelector("#profileMenu");
const profileTrigger = document.querySelector("#profileTrigger");
const profileDropdown = document.querySelector("#profileDropdown");
const profileAvatar = document.querySelector("#profileAvatar");
const profileName = document.querySelector("#profileName");
const logoutButton = document.querySelector("#logoutButton");
const systemStatus = document.querySelector("#systemStatus");
const ticketForm = document.querySelector("#ticketForm");
const submitButton = document.querySelector("#submitButton");
const formMessage = document.querySelector("#formMessage");
const formMeter = document.querySelector("#formMeter");
const ticketAuthGate = document.querySelector("#ticketAuthGate");
const mineAuthGate = document.querySelector("#mineAuthGate");
const myTicketsList = document.querySelector("#myTicketsList");
const refreshMine = document.querySelector("#refreshMine");
const staffDenied = document.querySelector("#staffDenied");
const ticketsList = document.querySelector("#ticketsList");
const ticketCount = document.querySelector("#ticketCount");
const pendingCount = document.querySelector("#pendingCount");
const approvedCount = document.querySelector("#approvedCount");
const deniedCount = document.querySelector("#deniedCount");
const rejectedCount = document.querySelector("#rejectedCount");
const batchCount = document.querySelector("#batchCount");
const ticketSearch = document.querySelector("#ticketSearch");
const statusButtons = document.querySelectorAll("[data-status-filter]");
const batchFilter = document.querySelector("#batchFilter");
const ticketSort = document.querySelector("#ticketSort");
const autoBatchPending = document.querySelector("#autoBatchPending");
const refreshTickets = document.querySelector("#refreshTickets");
const exportTickets = document.querySelector("#exportTickets");
const ticketTemplate = document.querySelector("#ticketTemplate");
const usernameInput = document.querySelector("#username");
const notifyEmail = document.querySelector("#notifyEmail");
const notifyDiscord = document.querySelector("#notifyDiscord");
const notificationEmail = document.querySelector("#notificationEmail");
const notificationEmailGroup = document.querySelector("#notificationEmailGroup");
const requiredFields = [...ticketForm.querySelectorAll("[required]")];

const state = {
  user: null,
  tickets: [],
  myTickets: [],
  staffFilter: "all",
  staffSearch: "",
  staffBatch: "all",
  staffSort: "newest"
};

const STATUS_LABELS = {
  pending: "Pending",
  approved: "Approved",
  denied: "Denied",
  rejected: "Rejected"
};

const STATUS_ORDER = {
  pending: 0,
  approved: 1,
  denied: 2,
  rejected: 3
};

async function apiRequest(path, options = {}) {
  const { timeout = 12000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeout);
  let response;

  try {
    response = await fetch(path, {
      credentials: "include",
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(fetchOptions.headers || {})
      }
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Request timed out. Try again in a moment.");
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : {};

  if (!response.ok) {
    throw new Error(body.error || "Request failed");
  }

  return body;
}

function setActiveView(name) {
  views.forEach((view) => view.classList.toggle("active", view.dataset.view === name));
  viewLinks.forEach((link) => link.classList.toggle("active", link.dataset.viewLink === name));

  const url = new URL(window.location.href);
  url.searchParams.set("view", name);
  window.history.replaceState({}, "", url);

  if (name === "mine") {
    loadMyTickets();
  }

  if (name === "staff") {
    loadStaffTickets();
  }
}

function setMessage(element, message, type = "") {
  element.textContent = message;
  element.className = `form-message ${type}`.trim();
}

function setButtonLoading(button, loading, text) {
  const label = button.querySelector("span") || button;

  if (!button.dataset.originalText) {
    button.dataset.originalText = label.textContent;
  }

  button.disabled = loading;
  button.classList.toggle("is-loading", loading);
  label.textContent = loading ? text : button.dataset.originalText;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function discordName(user) {
  if (!user) {
    return "Unknown";
  }

  return user.globalName || user.username || "Discord User";
}

function updateSessionUI() {
  const loggedIn = Boolean(state.user);
  loginButton.hidden = loggedIn;
  profileMenu.hidden = !loggedIn;
  ticketAuthGate.hidden = loggedIn;
  mineAuthGate.hidden = loggedIn;

  staffOnlyElements.forEach((element) => {
    element.hidden = !state.user?.staff;
  });

  if (!loggedIn) {
    return;
  }

  profileAvatar.src = state.user.avatarUrl || "/assets/vplf-logo.svg";
  profileName.textContent = discordName(state.user);

  if (!usernameInput.value) {
    usernameInput.value = discordName(state.user);
    updateFormMeter();
  }
}

function updateFormMeter() {
  const complete = requiredFields.filter((field) => field.value.trim()).length;
  const progress = Math.round((complete / requiredFields.length) * 100);
  formMeter.style.width = `${progress}%`;
}

function setSystemStatus(kind, text) {
  systemStatus.textContent = text;
  systemStatus.dataset.status = kind;
}

async function loadSession() {
  try {
    const data = await apiRequest("/api/me");
    state.user = data.user || null;
  } catch {
    state.user = null;
  }

  updateSessionUI();
}

async function checkHealth() {
  try {
    const data = await apiRequest("/api/health");
    setSystemStatus(data.ready ? "online" : "warn", data.ready ? "Online" : "Setup Needed");
  } catch {
    setSystemStatus("offline", "Offline");
  }
}

function emptyState(message) {
  const element = document.createElement("p");
  element.className = "empty-state";
  element.textContent = message;
  return element;
}

function getFilteredStaffTickets() {
  const search = state.staffSearch.trim().toLowerCase();

  const filtered = state.tickets.filter((ticket) => {
    const statusMatch = state.staffFilter === "all" || ticket.status === state.staffFilter;
    const batchMatch = state.staffBatch === "all" || getTicketBatch(ticket) === state.staffBatch;
    const searchable = [
      ticket.ticketCode,
      ticket.username,
      ticket.gameId,
      ticket.itemWon,
      ticket.status,
      getTicketBatch(ticket),
      ticket.additionalInfo,
      ticket.requesterUsername,
      ticket.requesterDiscordId,
      ticket.notificationEmail
    ].join(" ").toLowerCase();

    return statusMatch && batchMatch && (!search || searchable.includes(search));
  });

  return sortTickets(filtered);
}

function updateStats() {
  ticketCount.textContent = state.tickets.length;
  pendingCount.textContent = state.tickets.filter((ticket) => ticket.status === "pending").length;
  approvedCount.textContent = state.tickets.filter((ticket) => ticket.status === "approved").length;
  deniedCount.textContent = state.tickets.filter((ticket) => ticket.status === "denied").length;
  rejectedCount.textContent = state.tickets.filter((ticket) => ticket.status === "rejected").length;
  batchCount.textContent = getBatchSummaries().length;
  syncBatchFilter();
}

function getBatchSummaries() {
  const batches = new Map();

  state.tickets.forEach((ticket) => {
    const code = getTicketBatch(ticket);
    const current = batches.get(code) || { code, count: 0 };
    current.count += 1;
    batches.set(code, current);
  });

  return [...batches.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function syncBatchFilter() {
  const previous = state.staffBatch;
  const summaries = getBatchSummaries();
  const valid = previous === "all" || summaries.some((batch) => batch.code === previous);
  state.staffBatch = valid ? previous : "all";
  batchFilter.replaceChildren(new Option("All Batches", "all"));

  summaries.forEach((batch) => {
    batchFilter.append(new Option(`${batch.code} (${batch.count})`, batch.code));
  });

  batchFilter.value = state.staffBatch;
}

function sortTickets(tickets) {
  const nextTickets = [...tickets];

  if (state.staffSort === "oldest") {
    return nextTickets.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  if (state.staffSort === "status") {
    return nextTickets.sort((a, b) => (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99) || new Date(b.createdAt) - new Date(a.createdAt));
  }

  if (state.staffSort === "batch") {
    return nextTickets.sort((a, b) => getTicketBatch(a).localeCompare(getTicketBatch(b)) || new Date(b.createdAt) - new Date(a.createdAt));
  }

  return nextTickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function createTicketCard(ticket, mode) {
  const fragment = ticketTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".ticket-request");
  const actions = fragment.querySelector("[data-ticket-actions]");
  const status = fragment.querySelector("[data-ticket-status]");
  const approveButton = fragment.querySelector("[data-approve-ticket]");
  const denyButton = fragment.querySelector("[data-deny-ticket]");
  const rejectButton = fragment.querySelector("[data-reject-ticket]");
  const batchButton = fragment.querySelector("[data-batch-ticket]");
  const autoBatchButton = fragment.querySelector("[data-auto-batch-ticket]");
  const copyButton = fragment.querySelector("[data-copy-ticket]");

  fragment.querySelector("[data-ticket-code]").textContent = ticket.ticketCode;
  fragment.querySelector("[data-ticket-username]").textContent = ticket.username;
  fragment.querySelector("[data-ticket-discord]").textContent = `${ticket.requesterUsername || "Unknown"} (${ticket.requesterDiscordId || "no id"})`;
  fragment.querySelector("[data-ticket-batch]").textContent = `${getTicketBatch(ticket)} - ${ticket.batchMode === "manual" ? "Manual" : "Auto"}`;
  fragment.querySelector("[data-ticket-notices]").textContent = getNoticeLabel(ticket);
  fragment.querySelector("[data-ticket-item]").textContent = ticket.itemWon;
  fragment.querySelector("[data-ticket-id]").textContent = ticket.gameId;
  fragment.querySelector("[data-ticket-info]").textContent = ticket.additionalInfo || "No extra details";
  fragment.querySelector("[data-ticket-date]").textContent = formatDate(ticket.createdAt);
  fragment.querySelector("[data-ticket-review]").textContent = getReviewLabel(ticket);
  fragment.querySelector("[data-ticket-reason]").textContent = ticket.decisionReason || "No decision reason";

  const messageLink = fragment.querySelector("[data-ticket-message]");
  messageLink.href = ticket.messageLink;

  const serverLink = fragment.querySelector("[data-ticket-server]");
  serverLink.href = ticket.serverLink;

  status.textContent = STATUS_LABELS[ticket.status] || "Pending";
  status.classList.add(ticket.status || "pending");

  copyButton.addEventListener("click", () => copyTicketCode(ticket.ticketCode, copyButton));

  if (mode !== "staff") {
    actions.replaceChildren(copyButton);
  } else {
    approveButton.disabled = ticket.status === "approved";
    denyButton.disabled = ticket.status === "denied";
    rejectButton.disabled = ticket.status === "rejected";
    autoBatchButton.disabled = ticket.batchMode === "auto";
    approveButton.textContent = ticket.status === "approved" ? "Approved" : "Approve";
    denyButton.textContent = ticket.status === "denied" ? "Denied" : "Deny";
    rejectButton.textContent = ticket.status === "rejected" ? "Rejected" : "Reject";
    approveButton.addEventListener("click", () => decideTicket(ticket.id, "approved"));
    denyButton.addEventListener("click", () => decideTicket(ticket.id, "denied"));
    rejectButton.addEventListener("click", () => decideTicket(ticket.id, "rejected"));
    batchButton.addEventListener("click", () => moveTicketToManualBatch(ticket.id));
    autoBatchButton.addEventListener("click", () => moveTicketToAutoBatch(ticket.id));
  }

  card.dataset.ticketId = ticket.id;
  return fragment;
}

function renderMyTickets() {
  myTicketsList.replaceChildren();

  if (!state.user) {
    return;
  }

  if (!state.myTickets.length) {
    myTicketsList.append(emptyState("No submitted tickets yet."));
    return;
  }

  state.myTickets.forEach((ticket) => myTicketsList.append(createTicketCard(ticket, "mine")));
}

function renderStaffTickets() {
  updateStats();
  ticketsList.replaceChildren();

  if (!state.user?.staff) {
    staffDenied.hidden = false;
    return;
  }

  staffDenied.hidden = true;
  const tickets = getFilteredStaffTickets();

  if (!tickets.length) {
    ticketsList.append(emptyState(state.tickets.length ? "No tickets match that view." : "No ticket requests yet."));
    return;
  }

  tickets.forEach((ticket) => ticketsList.append(createTicketCard(ticket, "staff")));
}

async function loadMyTickets() {
  if (!state.user) {
    renderMyTickets();
    return;
  }

  try {
    const data = await apiRequest("/api/my-tickets");
    state.myTickets = data.tickets || [];
    renderMyTickets();
  } catch (error) {
    myTicketsList.replaceChildren(emptyState(error.message));
  }
}

async function loadStaffTickets() {
  if (!state.user?.staff) {
    renderStaffTickets();
    return;
  }

  try {
    const data = await apiRequest("/api/tickets");
    state.tickets = data.tickets || [];
    renderStaffTickets();
  } catch (error) {
    ticketsList.replaceChildren(emptyState(error.message));
  }
}

async function decideTicket(ticketId, status) {
  const reason = status === "approved"
    ? ""
    : window.prompt(`Optional reason for ${STATUS_LABELS[status].toLowerCase()} ticket:`) || "";

  const data = await apiRequest(`/api/tickets/${ticketId}`, {
    method: "PATCH",
    body: JSON.stringify({ status, decisionReason: reason.trim() })
  });

  state.tickets = state.tickets.map((ticket) => ticket.id === ticketId ? data.ticket : ticket);
  renderStaffTickets();
}

async function moveTicketToManualBatch(ticketId) {
  const batchCode = window.prompt("Manual batch code, for example DROP-01 or WEEKLY-FINALS:");
  if (!batchCode?.trim()) {
    return;
  }

  const data = await apiRequest(`/api/tickets/${ticketId}`, {
    method: "PATCH",
    body: JSON.stringify({ batchMode: "manual", batchCode: batchCode.trim() })
  });

  state.tickets = state.tickets.map((ticket) => ticket.id === ticketId ? data.ticket : ticket);
  renderStaffTickets();
}

async function moveTicketToAutoBatch(ticketId) {
  const data = await apiRequest(`/api/tickets/${ticketId}`, {
    method: "PATCH",
    body: JSON.stringify({ batchMode: "auto" })
  });

  state.tickets = state.tickets.map((ticket) => ticket.id === ticketId ? data.ticket : ticket);
  renderStaffTickets();
}

async function autoBatchPendingTickets() {
  const pendingTickets = state.tickets.filter((ticket) => ticket.status === "pending");
  if (!pendingTickets.length) {
    return;
  }

  setButtonLoading(autoBatchPending, true, "Batching");
  try {
    for (const ticket of pendingTickets) {
      const data = await apiRequest(`/api/tickets/${ticket.id}`, {
        method: "PATCH",
        body: JSON.stringify({ batchMode: "auto" })
      });
      state.tickets = state.tickets.map((item) => item.id === ticket.id ? data.ticket : item);
    }
    renderStaffTickets();
  } finally {
    setButtonLoading(autoBatchPending, false);
  }
}

async function copyTicketCode(ticketCode, button) {
  try {
    await navigator.clipboard.writeText(ticketCode);
    button.textContent = "Copied";
    window.setTimeout(() => {
      button.textContent = "Copy Code";
    }, 1100);
  } catch {
    button.textContent = ticketCode;
  }
}

function exportCsv() {
  const tickets = getFilteredStaffTickets();
  if (!tickets.length) {
    return;
  }

  const columns = [
    "ticketCode",
    "status",
    "batchCode",
    "batchMode",
    "username",
    "gameId",
    "itemWon",
    "requesterUsername",
    "requesterDiscordId",
    "notifyEmail",
    "notificationEmail",
    "notifyDiscord",
    "messageLink",
    "serverLink",
    "additionalInfo",
    "decisionReason",
    "reviewedAt",
    "reviewedByUsername",
    "createdAt"
  ];
  const escape = (value) => `"${String(value || "").replaceAll("\"", "\"\"")}"`;
  const rows = [
    columns.join(","),
    ...tickets.map((ticket) => columns.map((column) => escape(ticket[column])).join(","))
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vplf-tickets-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

ticketForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state.user) {
    window.location.href = "/api/auth/discord";
    return;
  }

  setButtonLoading(submitButton, true, "Submitting");
  setMessage(formMessage, "", "");

  const formData = new FormData(ticketForm);
  const payload = {
    username: String(formData.get("username")).trim(),
    gameId: String(formData.get("gameId")).trim(),
    itemWon: String(formData.get("itemWon")).trim(),
    messageLink: String(formData.get("messageLink")).trim(),
    serverLink: String(formData.get("serverLink")).trim(),
    additionalInfo: String(formData.get("additionalInfo")).trim(),
    notifyEmail: formData.get("notifyEmail") === "on",
    notificationEmail: String(formData.get("notificationEmail") || "").trim(),
    notifyDiscord: formData.get("notifyDiscord") === "on"
  };

  try {
    const data = await apiRequest("/api/tickets", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    ticketForm.reset();
    usernameInput.value = discordName(state.user);
    syncNotificationFields();
    updateFormMeter();
    setMessage(formMessage, `Ticket submitted: ${data.ticket.ticketCode}`, "success");
    await loadMyTickets();
  } catch (error) {
    setMessage(formMessage, error.message, "error");
  } finally {
    setButtonLoading(submitButton, false);
  }
});

viewLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    setActiveView(link.dataset.viewLink);
    profileDropdown.hidden = true;
    profileTrigger?.setAttribute("aria-expanded", "false");
  });
});

profileTrigger.addEventListener("click", () => {
  const nextHidden = !profileDropdown.hidden ? true : false;
  profileDropdown.hidden = nextHidden;
  profileTrigger.setAttribute("aria-expanded", String(!nextHidden));
});

logoutButton.addEventListener("click", async () => {
  await apiRequest("/api/auth/logout", { method: "POST" });
  state.user = null;
  state.tickets = [];
  state.myTickets = [];
  updateSessionUI();
  setActiveView("home");
});

requiredFields.forEach((field) => {
  field.addEventListener("input", updateFormMeter);
  field.addEventListener("change", updateFormMeter);
});

ticketSearch.addEventListener("input", () => {
  state.staffSearch = ticketSearch.value;
  renderStaffTickets();
});

batchFilter.addEventListener("change", () => {
  state.staffBatch = batchFilter.value;
  renderStaffTickets();
});

ticketSort.addEventListener("change", () => {
  state.staffSort = ticketSort.value;
  renderStaffTickets();
});

statusButtons.forEach((button) => {
  button.addEventListener("click", () => {
    statusButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.staffFilter = button.dataset.statusFilter;
    renderStaffTickets();
  });
});

refreshMine.addEventListener("click", loadMyTickets);
refreshTickets.addEventListener("click", loadStaffTickets);
exportTickets.addEventListener("click", exportCsv);
autoBatchPending.addEventListener("click", autoBatchPendingTickets);

notifyEmail.addEventListener("change", syncNotificationFields);

document.addEventListener("click", (event) => {
  if (!profileMenu.contains(event.target)) {
    profileDropdown.hidden = true;
    profileTrigger.setAttribute("aria-expanded", "false");
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    profileDropdown.hidden = true;
    profileTrigger.setAttribute("aria-expanded", "false");
  }
});

init();

async function init() {
  syncNotificationFields();
  updateFormMeter();

  const requestedView = new URLSearchParams(window.location.search).get("view");
  setActiveView(requestedView === "onboarding" ? "home" : requestedView || "home");

  const results = await Promise.allSettled([loadSession(), checkHealth()]);
  if (results.some((result) => result.status === "rejected")) {
    setSystemStatus("offline", "Offline");
  }

  const activeView = document.querySelector(".view.active")?.dataset.view;
  if (activeView === "mine") {
    await loadMyTickets();
  }
  if (activeView === "staff") {
    await loadStaffTickets();
  }
}

function syncNotificationFields() {
  const enabled = notifyEmail.checked;
  notificationEmail.disabled = !enabled;
  notificationEmail.required = enabled;
  notificationEmailGroup.classList.toggle("is-disabled", !enabled);

  if (!enabled) {
    notificationEmail.value = "";
  }
}

function getNoticeLabel(ticket) {
  const notices = [];
  if (ticket.notifyEmail) {
    notices.push(ticket.notificationEmail ? `Email: ${ticket.notificationEmail}` : "Email");
  }
  if (ticket.notifyDiscord) {
    notices.push("Discord DM");
  }

  return notices.length ? notices.join(" / ") : "None";
}

function getTicketBatch(ticket) {
  return ticket.batchCode || "UNBATCHED";
}

function getReviewLabel(ticket) {
  if (!ticket.reviewedAt) {
    return "Not reviewed yet";
  }

  const reviewer = ticket.reviewedByUsername || "VPLF Staff";
  return `${formatDate(ticket.reviewedAt)} by ${reviewer}`;
}
