const ADMIN_SESSION_KEY = "vplf.admin.password";

const ticketForm = document.querySelector("#ticketForm");
const submitButton = document.querySelector("#submitButton");
const formMessage = document.querySelector("#formMessage");
const formMeter = document.querySelector("#formMeter");
const loginModal = document.querySelector("#loginModal");
const loginForm = document.querySelector("#loginForm");
const loginButton = document.querySelector("#loginButton");
const loginMessage = document.querySelector("#loginMessage");
const adminPassword = document.querySelector("#adminPassword");
const closeLogin = document.querySelector("#closeLogin");
const logoutButton = document.querySelector("#logoutButton");
const ticketsList = document.querySelector("#ticketsList");
const ticketCount = document.querySelector("#ticketCount");
const pendingCount = document.querySelector("#pendingCount");
const approvedCount = document.querySelector("#approvedCount");
const ticketSearch = document.querySelector("#ticketSearch");
const statusFilter = document.querySelector("#statusFilter");
const refreshTickets = document.querySelector("#refreshTickets");
const exportTickets = document.querySelector("#exportTickets");
const ticketTemplate = document.querySelector("#ticketTemplate");
const databaseStatus = document.querySelector("#databaseStatus");
const views = document.querySelectorAll("[data-view]");
const modeButtons = document.querySelectorAll(".mode-button");
const openPanelButtons = document.querySelectorAll("[data-open-panel]");
const showCreateButtons = document.querySelectorAll("[data-show-create]");
const requiredFields = [...ticketForm.querySelectorAll("[required]")];

const state = {
  tickets: [],
  filter: "all",
  search: "",
  adminPassword: sessionStorage.getItem(ADMIN_SESSION_KEY) || ""
};

async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (state.adminPassword) {
    headers["X-Admin-Password"] = state.adminPassword;
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : {};

  if (!response.ok) {
    throw new Error(body.error || "Request failed");
  }

  return body;
}

function setActiveView(viewName) {
  views.forEach((view) => {
    view.classList.toggle("active", view.dataset.view === viewName);
  });

  modeButtons.forEach((button) => {
    const isPanelButton = button.hasAttribute("data-open-panel");
    button.classList.toggle("active", viewName === "admin" ? isPanelButton : !isPanelButton);
  });
}

function setMessage(element, message, type) {
  element.textContent = message;
  element.className = `form-message ${type || ""}`.trim();
}

function setButtonLoading(button, isLoading, loadingText) {
  const label = button.querySelector("span") || button;

  if (!button.dataset.originalText) {
    button.dataset.originalText = label.textContent;
  }

  button.disabled = isLoading;
  button.classList.toggle("is-loading", isLoading);
  label.textContent = isLoading ? loadingText : button.dataset.originalText;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function openLogin() {
  loginModal.hidden = false;
  setMessage(loginMessage, "", "");
  adminPassword.value = "";
  window.setTimeout(() => adminPassword.focus(), 0);
}

function closeLoginModal() {
  loginModal.hidden = true;
}

function updateFormMeter() {
  const complete = requiredFields.filter((field) => field.value.trim()).length;
  const progress = Math.round((complete / requiredFields.length) * 100);
  formMeter.style.width = `${progress}%`;
}

function updateDatabaseStatus(isOnline, label) {
  databaseStatus.textContent = label;
  databaseStatus.classList.toggle("online", isOnline);
  databaseStatus.classList.toggle("offline", !isOnline);
}

async function checkHealth() {
  try {
    await apiRequest("/api/health");
    updateDatabaseStatus(true, "SQLite Online");
  } catch {
    updateDatabaseStatus(false, "Server Offline");
  }
}

function getFilteredTickets() {
  const searchTerm = state.search.trim().toLowerCase();

  return state.tickets.filter((ticket) => {
    const matchesStatus = state.filter === "all" || ticket.status === state.filter;
    const searchable = [
      ticket.ticketCode,
      ticket.username,
      ticket.gameId,
      ticket.itemWon,
      ticket.additionalInfo
    ].join(" ").toLowerCase();

    return matchesStatus && (!searchTerm || searchable.includes(searchTerm));
  });
}

function updateStats() {
  const total = state.tickets.length;
  const pending = state.tickets.filter((ticket) => ticket.status === "pending").length;
  const approved = state.tickets.filter((ticket) => ticket.status === "approved").length;

  ticketCount.textContent = total;
  pendingCount.textContent = pending;
  approvedCount.textContent = approved;
}

function createTicketCard(ticket) {
  const fragment = ticketTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".ticket-request");
  const status = fragment.querySelector("[data-ticket-status]");
  const approveButton = fragment.querySelector("[data-approve-ticket]");
  const denyButton = fragment.querySelector("[data-deny-ticket]");
  const copyButton = fragment.querySelector("[data-copy-ticket]");

  fragment.querySelector("[data-ticket-code]").textContent = ticket.ticketCode;
  fragment.querySelector("[data-ticket-username]").textContent = ticket.username;
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

  approveButton.disabled = ticket.status === "approved";
  approveButton.textContent = ticket.status === "approved" ? "Approved" : "Approve";
  approveButton.addEventListener("click", () => approveTicket(ticket.id));
  denyButton.addEventListener("click", () => denyTicket(ticket.id));
  copyButton.addEventListener("click", () => copyTicketCode(ticket.ticketCode, copyButton));

  card.dataset.ticketId = ticket.id;
  return fragment;
}

function renderTickets() {
  updateStats();
  ticketsList.replaceChildren();

  const tickets = getFilteredTickets();

  if (!tickets.length) {
    const emptyState = document.createElement("p");
    emptyState.className = "empty-state";
    emptyState.textContent = state.tickets.length ? "No tickets match that view." : "No ticket requests yet.";
    ticketsList.append(emptyState);
    return;
  }

  tickets.forEach((ticket) => ticketsList.append(createTicketCard(ticket)));
}

async function loadTickets() {
  const data = await apiRequest("/api/tickets");
  state.tickets = data.tickets || [];
  renderTickets();
}

async function requestAdminPanel() {
  if (!state.adminPassword) {
    openLogin();
    return;
  }

  try {
    await loadTickets();
    setActiveView("admin");
  } catch {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    state.adminPassword = "";
    openLogin();
    setMessage(loginMessage, "Admin password required.", "error");
  }
}

async function approveTicket(ticketId) {
  try {
    const data = await apiRequest(`/api/tickets/${ticketId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "approved" })
    });

    state.tickets = state.tickets.map((ticket) => ticket.id === ticketId ? data.ticket : ticket);
    renderTickets();
  } catch (error) {
    setMessage(loginMessage, error.message, "error");
  }
}

async function denyTicket(ticketId) {
  try {
    await apiRequest(`/api/tickets/${ticketId}`, {
      method: "DELETE"
    });

    state.tickets = state.tickets.filter((ticket) => ticket.id !== ticketId);
    renderTickets();
  } catch (error) {
    setMessage(loginMessage, error.message, "error");
  }
}

async function copyTicketCode(ticketCode, button) {
  try {
    await navigator.clipboard.writeText(ticketCode);
    button.textContent = "Copied";
    window.setTimeout(() => {
      button.textContent = "Copy ID";
    }, 1200);
  } catch {
    button.textContent = ticketCode;
  }
}

function exportCsv() {
  if (!state.tickets.length) {
    return;
  }

  const columns = ["ticketCode", "status", "username", "gameId", "itemWon", "messageLink", "serverLink", "additionalInfo", "createdAt"];
  const escape = (value) => `"${String(value || "").replaceAll("\"", "\"\"")}"`;
  const rows = [
    columns.join(","),
    ...state.tickets.map((ticket) => columns.map((column) => escape(ticket[column])).join(","))
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
    updateFormMeter();
    setMessage(formMessage, `Ticket submitted: ${data.ticket.ticketCode}`, "success");
  } catch (error) {
    setMessage(formMessage, `${error.message}. Start the SQLite server with py server.py.`, "error");
  } finally {
    setButtonLoading(submitButton, false);
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setButtonLoading(loginButton, true, "Checking");
  setMessage(loginMessage, "", "");

  state.adminPassword = adminPassword.value;

  try {
    await loadTickets();
    sessionStorage.setItem(ADMIN_SESSION_KEY, state.adminPassword);
    closeLoginModal();
    setActiveView("admin");
  } catch (error) {
    state.adminPassword = "";
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    setMessage(loginMessage, error.message || "Incorrect password.", "error");
    adminPassword.select();
  } finally {
    setButtonLoading(loginButton, false);
  }
});

openPanelButtons.forEach((button) => {
  button.addEventListener("click", requestAdminPanel);
});

showCreateButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    setActiveView("create");
  });
});

requiredFields.forEach((field) => {
  field.addEventListener("input", updateFormMeter);
  field.addEventListener("change", updateFormMeter);
});

ticketSearch.addEventListener("input", () => {
  state.search = ticketSearch.value;
  renderTickets();
});

statusFilter.addEventListener("change", () => {
  state.filter = statusFilter.value;
  renderTickets();
});

refreshTickets.addEventListener("click", async () => {
  try {
    await loadTickets();
  } catch (error) {
    setMessage(loginMessage, error.message, "error");
  }
});

exportTickets.addEventListener("click", exportCsv);

closeLogin.addEventListener("click", closeLoginModal);

loginModal.addEventListener("click", (event) => {
  if (event.target === loginModal) {
    closeLoginModal();
  }
});

logoutButton.addEventListener("click", () => {
  sessionStorage.removeItem(ADMIN_SESSION_KEY);
  state.adminPassword = "";
  setActiveView("create");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !loginModal.hidden) {
    closeLoginModal();
  }
});

setActiveView("create");
updateFormMeter();
checkHealth();
