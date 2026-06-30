document.addEventListener("DOMContentLoaded", async () => {
  const titleInput = document.getElementById("title");
  const descInput = document.getElementById("description");
  const boardSelect = document.getElementById("boardSelect");
  const boardSelectContainer = document.getElementById("boardSelectContainer");
  const boardSkeleton = document.getElementById("boardSkeleton");
  const listSelect = document.getElementById("listSelect");
  const listSelectContainer = document.getElementById("listSelectContainer");
  const listSkeleton = document.getElementById("listSkeleton");
  const clipBtn = document.getElementById("clipBtn");
  const statusMsg = document.getElementById("statusMsg");

  const settingsBtn = document.getElementById("settingsBtn");
  const settingsPanel = document.getElementById("settingsPanel");
  const closeSettingsBtn = document.getElementById("closeSettingsBtn");
  const saveSettingsBtn = document.getElementById("saveSettingsBtn");
  const apiHostInput = document.getElementById("apiHostInput");

  const formContent = document.getElementById("formContent");
  const successView = document.getElementById("successView");

  let activeTabUrl = "";
  let apiHost = localStorage.getItem("collabpm_api_host") || "https://kanban-assignment.cytieq.com";

  // Pre-fill input value
  apiHostInput.value = apiHost;

  // Toggle settings panel
  settingsBtn.addEventListener("click", () => {
    settingsPanel.classList.add("active");
  });

  closeSettingsBtn.addEventListener("click", () => {
    settingsPanel.classList.remove("active");
  });

  saveSettingsBtn.addEventListener("click", () => {
    const newHost = apiHostInput.value.trim();
    if (newHost) {
      apiHost = newHost;
      localStorage.setItem("collabpm_api_host", newHost);
      settingsPanel.classList.remove("active");
      initClipper();
    }
  });

  function setDefaultContext(url) {
    const refLink = url ? `\n\nReference: ${url}` : '';
    descInput.value = `Page clipped from browser.${refLink}`;
    const contextBadge = document.getElementById("contextBadge");
    contextBadge.innerHTML = `<span class="badge badge-blue">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 2px;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
      Page URL
    </span>`;
  }

  // 1. Get current active tab info and extract text selection
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) return;

    activeTabUrl = tab.url || "";
    titleInput.value = tab.title || "Clipped Task";

    try {
      chrome.scripting.executeScript(
        {
          target: { tabId: tab.id },
          func: () => window.getSelection().toString(),
        },
        (results) => {
          if (chrome.runtime.lastError) {
            setDefaultContext(activeTabUrl);
            return;
          }
          const selection = results?.[0]?.result;
          const refLink = `\n\nReference: ${activeTabUrl}`;
          const contextBadge = document.getElementById("contextBadge");
          if (selection && selection.trim()) {
            descInput.value = `"${selection.trim()}"${refLink}`;
            contextBadge.innerHTML = `<span class="badge badge-green">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 2px;"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
              Selection active
            </span>`;
          } else {
            setDefaultContext(activeTabUrl);
          }
        }
      );
    } catch (err) {
      setDefaultContext(activeTabUrl);
    }
  });

  // Verify connection and fetch boards
  async function initClipper() {
    statusMsg.className = "message";
    statusMsg.textContent = "";
    clipBtn.disabled = true;

    // Reset select dropdowns and show loading skeleton
    boardSelect.innerHTML = '<option value="">Fetching boards...</option>';
    boardSelectContainer.classList.add("hidden");
    boardSkeleton.classList.remove("hidden");

    listSelect.innerHTML = '<option value="">Choose board first...</option>';
    listSelectContainer.classList.add("hidden");
    listSkeleton.classList.remove("hidden");

    try {
      const res = await fetch(`${apiHost}/api/boards`);
      if (!res.ok) throw new Error("Could not fetch boards");
      const boards = await res.json();

      boardSelect.innerHTML = '<option value="">-- Choose a Board --</option>';
      boards.forEach((board) => {
        const opt = document.createElement("option");
        opt.value = board.id;
        opt.textContent = board.name;
        boardSelect.appendChild(opt);
      });
    } catch (err) {
      statusMsg.className = "message error";
      statusMsg.textContent = "Error fetching boards. Is backend offline?";
      boardSelect.innerHTML = '<option value="">Failed to connect</option>';
      listSelect.innerHTML = '<option value="">Failed to connect</option>';
      console.error(err);
    } finally {
      boardSkeleton.classList.add("hidden");
      boardSelectContainer.classList.remove("hidden");
      listSkeleton.classList.add("hidden");
      listSelectContainer.classList.remove("hidden");
    }
  }

  // 3. Handle Board selection changes to load columns (lists)
  boardSelect.addEventListener("change", async () => {
    const boardId = boardSelect.value;

    // Reset columns select and show skeleton
    listSelect.innerHTML = '<option value="">Fetching columns...</option>';
    listSelectContainer.classList.add("hidden");
    listSkeleton.classList.remove("hidden");
    clipBtn.disabled = true;

    if (!boardId) {
      listSkeleton.classList.add("hidden");
      listSelectContainer.classList.remove("hidden");
      listSelect.innerHTML = '<option value="">Choose board first...</option>';
      return;
    }

    try {
      const res = await fetch(`${apiHost}/api/board/${boardId}/lists`);
      if (!res.ok) throw new Error("Could not fetch board lists");
      const lists = await res.json();

      listSelect.innerHTML = '<option value="">-- Choose a Column --</option>';
      lists.forEach((list) => {
        const opt = document.createElement("option");
        opt.value = list.id;
        opt.textContent = list.name;
        listSelect.appendChild(opt);
      });
    } catch (err) {
      listSelect.innerHTML = '<option value="">Failed to load columns</option>';
      console.error(err);
    } finally {
      listSkeleton.classList.add("hidden");
      listSelectContainer.classList.remove("hidden");
    }
  });

  // 4. Enable button once a column is chosen
  listSelect.addEventListener("change", () => {
    clipBtn.disabled = !listSelect.value;
  });

  // 5. Submit card to backend
  clipBtn.addEventListener("click", async () => {
    const boardId = boardSelect.value;
    const listId = listSelect.value;
    const title = titleInput.value.trim();
    const description = descInput.value.trim();

    if (!boardId || !listId || !title) {
      statusMsg.className = "message error";
      statusMsg.textContent = "Fields cannot be empty.";
      return;
    }

    clipBtn.disabled = true;
    statusMsg.className = "message";
    statusMsg.textContent = "Clipping task...";

    try {
      const res = await fetch(`${apiHost}/api/board/${boardId}/card`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, listId }),
      });

      if (!res.ok) throw new Error("Clipper POST failed");

      // Show beautiful success view
      formContent.classList.add("hidden");
      successView.classList.remove("hidden");
      statusMsg.className = "hidden";

      setTimeout(() => {
        window.close();
      }, 1800);
    } catch (err) {
      statusMsg.className = "message error";
      statusMsg.textContent = "Failed to clip task.";
      clipBtn.disabled = false;
      console.error(err);
    }
  });

  // Initialize
  initClipper();
});
