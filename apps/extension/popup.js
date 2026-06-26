const API_HOST = "http://localhost:4000";

document.addEventListener("DOMContentLoaded", async () => {
  const titleInput = document.getElementById("title");
  const descInput = document.getElementById("description");
  const boardSelect = document.getElementById("boardSelect");
  const listSelect = document.getElementById("listSelect");
  const clipBtn = document.getElementById("clipBtn");
  const statusMsg = document.getElementById("statusMsg");

  let activeTabUrl = "";

  // 1. Get current active tab info and extract text selection
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab) return;

    activeTabUrl = tab.url || "";
    titleInput.value = tab.title || "Clipped Task";

    chrome.scripting.executeScript(
      {
        target: { tabId: tab.id },
        func: () => window.getSelection().toString(),
      },
      (results) => {
        const selection = results?.[0]?.result;
        const refLink = `\n\nReference: ${activeTabUrl}`;
        if (selection && selection.trim()) {
          descInput.value = `"${selection.trim()}"${refLink}`;
        } else {
          descInput.value = `Page clipped from browser.${refLink}`;
        }
      }
    );
  });

  // 2. Fetch available boards from backend
  try {
    const res = await fetch(`${API_HOST}/api/boards`);
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
    statusMsg.textContent = "Error: Backend server is offline.";
    console.error(err);
  }

  // 3. Handle Board selection changes to load columns (lists)
  boardSelect.addEventListener("change", async () => {
    const boardId = boardSelect.value;
    listSelect.innerHTML = '<option value="">Fetching columns...</option>';
    clipBtn.disabled = true;

    if (!boardId) {
      listSelect.innerHTML = '<option value="">Choose board first...</option>';
      return;
    }

    try {
      const res = await fetch(`${API_HOST}/api/board/${boardId}/lists`);
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
      const res = await fetch(`${API_HOST}/api/board/${boardId}/card`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, listId }),
      });

      if (!res.ok) throw new Error("Clipper POST failed");

      statusMsg.className = "message success";
      statusMsg.textContent = "Clipped successfully!";
      
      setTimeout(() => {
        window.close();
      }, 1500);
    } catch (err) {
      statusMsg.className = "message error";
      statusMsg.textContent = "Failed to clip task.";
      clipBtn.disabled = false;
      console.error(err);
    }
  });
});
