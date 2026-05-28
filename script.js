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
const ticketSearch = document.querySelector("#ticketSearch");
const statusButtons = document.querySelectorAll("[data-status-filter]");
const refreshTickets = document.querySelector("#refreshTickets");
const exportTickets = document.querySelector("#exportTickets");
const ticketTemplate = document.querySelector("#ticketTemplate");
const usernameInput = document.querySelector("#username");
const requiredFields = [...ticketForm.querySelectorAll("[required]")];

const state = {
  user: null,
  tickets: [],
  myTickets: [],
  staffFilter: "all",
  staffSearch: ""
};

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: "include",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

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

  return state.tickets.filter((ticket) => {
    const statusMatch = state.staffFilter === "all" || ticket.status === state.staffFilter;
    const searchable = [
      ticket.ticketCode,
      ticket.username,
      ticket.gameId,
      ticket.itemWon,
      ticket.additionalInfo,
      ticket.requesterUsername,
      ticket.requesterDiscordId
    ].join(" ").toLowerCase();

    return statusMatch && (!search || searchable.includes(search));
  });
}

function updateStats() {
  ticketCount.textContent = state.tickets.length;
  pendingCount.textContent = state.tickets.filter((ticket) => ticket.status === "pending").length;
  approvedCount.textContent = state.tickets.filter((ticket) => ticket.status === "approved").length;
}

function createTicketCard(ticket, mode) {
  const fragment = ticketTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".ticket-request");
  const actions = fragment.querySelector("[data-ticket-actions]");
  const status = fragment.querySelector("[data-ticket-status]");
  const approveButton = fragment.querySelector("[data-approve-ticket]");
  const denyButton = fragment.querySelector("[data-deny-ticket]");
  const copyButton = fragment.querySelector("[data-copy-ticket]");

  fragment.querySelector("[data-ticket-code]").textContent = ticket.ticketCode;
  fragment.querySelector("[data-ticket-username]").textContent = ticket.username;
  fragment.querySelector("[data-ticket-discord]").textContent = `${ticket.requesterUsername || "Unknown"} (${ticket.requesterDiscordId || "no id"})`;
  fragment.querySelector("[data-ticket-item]").textContent = ticket.itemWon;
  fragment.querySelector("[data-ticket-id]").textContent = ticket.gameId;
  fragment.querySelector("[data-ticket-info]").textContent = ticket.additionalInfo || "No extra details";
  fragment.querySelector("[data-ticket-date]").textContent = formatDate(ticket.createdAt);

  const messageLink = fragment.querySelector("[data-ticket-message]");
  messageLink.href = ticket.messageLink;

  const serverLink = fragment.querySelector("[data-ticket-server]");
  serverLink.href = ticket.serverLink;

  status.textContent = ticket.status === "approved" ? "Approved" : "Pending";
  status.classList.toggle("pending", ticket.status !== "approved");
  status.classList.toggle("approved", ticket.status === "approved");

  copyButton.addEventListener("click", () => copyTicketCode(ticket.ticketCode, copyButton));

  if (mode !== "staff") {
    actions.replaceChildren(copyButton);
  } else {
    approveButton.disabled = ticket.status === "approved";
    approveButton.textContent = ticket.status === "approved" ? "Approved" : "Approve";
    approveButton.addEventListener("click", () => approveTicket(ticket.id));
    denyButton.addEventListener("click", () => denyTicket(ticket.id));
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

async function approveTicket(ticketId) {
  const data = await apiRequest(`/api/tickets/${ticketId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "approved" })
  });

  state.tickets = state.tickets.map((ticket) => ticket.id === ticketId ? data.ticket : ticket);
  renderStaffTickets();
}

async function denyTicket(ticketId) {
  await apiRequest(`/api/tickets/${ticketId}`, {
    method: "DELETE"
  });

  state.tickets = state.tickets.filter((ticket) => ticket.id !== ticketId);
  renderStaffTickets();
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
    "username",
    "gameId",
    "itemWon",
    "requesterUsername",
    "requesterDiscordId",
    "messageLink",
    "serverLink",
    "additionalInfo",
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
    additionalInfo: String(formData.get("additionalInfo")).trim()
  };

  try {
    const data = await apiRequest("/api/tickets", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    ticketForm.reset();
    usernameInput.value = discordName(state.user);
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
  setActiveView("onboarding");
});

requiredFields.forEach((field) => {
  field.addEventListener("input", updateFormMeter);
  field.addEventListener("change", updateFormMeter);
});

ticketSearch.addEventListener("input", () => {
  state.staffSearch = ticketSearch.value;
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

await Promise.all([loadSession(), checkHealth()]);
updateFormMeter();

const requestedView = new URLSearchParams(window.location.search).get("view");
setActiveView(requestedView || "onboarding");
