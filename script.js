// Tab switching logic
function switchTab(windowId, tabId, clickedElement) {
    const win = document.getElementById(windowId);
    
    // Remove active class from all tabs in this window
    const tabs = win.querySelectorAll('.tab');
    tabs.forEach(t => t.classList.remove('active'));
    
    // Add active class to clicked tab
    clickedElement.classList.add('active');
    
    // Hide all tab panes in this window
    const panes = win.querySelectorAll('.tab-pane');
    panes.forEach(p => p.classList.remove('active-pane'));
    
    // Show target pane
    const targetPane = document.getElementById(tabId);
    if (targetPane) {
        targetPane.classList.add('active-pane');
    }
}

// Icon selection
function selectIcon(element) {
    const icons = document.querySelectorAll('.icon');
    icons.forEach(i => i.classList.remove('selected'));
    element.classList.add('selected');
}

// Clock
function updateClock() {
    const now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    minutes = minutes < 10 ? '0' + minutes : minutes;
    const strTime = hours + ':' + minutes + ' ' + ampm;
    document.getElementById('clock').innerText = strTime;
}
setInterval(updateClock, 1000);
updateClock();

// Start Menu
function toggleStartMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('start-menu');
    const btn = document.querySelector('.start-btn');
    if (menu.style.display === 'none') {
        menu.style.display = 'flex';
        btn.classList.add('active');
    } else {
        menu.style.display = 'none';
        btn.classList.remove('active');
    }
}

document.addEventListener('click', function(event) {
    const menu = document.getElementById('start-menu');
    const btn = document.querySelector('.start-btn');
    if (menu && menu.style.display === 'flex' && !menu.contains(event.target) && !btn.contains(event.target)) {
        menu.style.display = 'none';
        btn.classList.remove('active');
    }
    
    // Deselect icons if clicked on empty desktop
    if (event.target.classList.contains('desktop')) {
        const icons = document.querySelectorAll('.icon');
        icons.forEach(i => i.classList.remove('selected'));
    }
});

// Window Management
let activeWindowId = null;

function openWindow(id) {
    const win = document.getElementById(id);
    if (win) {
        win.style.display = 'flex';
        bringToFront(id);
        updateTaskbar();
    }
}

function closeWindow(id) {
    const win = document.getElementById(id);
    if (win) {
        win.style.display = 'none';
        updateTaskbar();
    }
}

function minimizeWindow(id) {
    const win = document.getElementById(id);
    if (win) {
        win.style.display = 'none'; // simple approach
        updateTaskbar();
    }
}

function maximizeWindow(id) {
    const win = document.getElementById(id);
    if (win) {
        if (win.dataset.maximized === "true") {
            // Restore
            win.style.width = win.dataset.oldWidth || '450px';
            win.style.height = win.dataset.oldHeight || 'auto';
            win.style.top = win.dataset.oldTop || '50px';
            win.style.left = win.dataset.oldLeft || '50px';
            win.dataset.maximized = "false";
        } else {
            // Maximize
            win.dataset.oldWidth = win.style.width;
            win.dataset.oldHeight = win.style.height;
            win.dataset.oldTop = win.style.top;
            win.dataset.oldLeft = win.style.left;
            
            win.style.width = '100%';
            win.style.height = 'calc(100vh - 28px)';
            win.style.top = '0';
            win.style.left = '0';
            win.dataset.maximized = "true";
        }
    }
}

function bringToFront(id) {
    const windows = document.querySelectorAll('.window');
    windows.forEach(w => w.classList.remove('active-window'));
    const win = document.getElementById(id);
    if (win) {
        win.classList.add('active-window');
        activeWindowId = id;
        updateTaskbar();
    }
}

// Taskbar
function updateTaskbar() {
    const taskbar = document.getElementById('taskbar-tasks');
    taskbar.innerHTML = '';
    const windows = document.querySelectorAll('.window');
    windows.forEach(win => {
        if (win.style.display !== 'none') {
            const titleSpan = win.querySelector('.titlebar-title span').innerText;
            const imgSrc = win.querySelector('.titlebar-title img').src;
            
            const taskBtn = document.createElement('div');
            taskBtn.className = 'taskbar-task' + (win.classList.contains('active-window') ? ' active' : '');
            taskBtn.innerHTML = `<img src="${imgSrc}"> <span>${titleSpan}</span>`;
            taskBtn.onclick = () => {
                if (win.classList.contains('active-window')) {
                    win.classList.remove('active-window');
                    win.style.display = 'none';
                } else {
                    win.style.display = 'flex';
                    bringToFront(win.id);
                }
                updateTaskbar();
            };
            taskbar.appendChild(taskBtn);
        }
    });
}

// Dragging Logic
const windows = document.querySelectorAll('.window');
windows.forEach(win => {
    const header = win.querySelector('.titlebar');
    
    win.addEventListener('mousedown', () => bringToFront(win.id));
    win.addEventListener('touchstart', () => bringToFront(win.id), {passive: true});

    let isDragging = false;
    let offsetX, offsetY;

    header.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('tbtn') || win.dataset.maximized === "true" || window.innerWidth <= 600) return;
        isDragging = true;
        bringToFront(win.id);
        const rect = win.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        let newX = e.clientX - offsetX;
        let newY = e.clientY - offsetY;
        
        newY = Math.max(0, newY); 
        
        win.style.left = newX + 'px';
        win.style.top = newY + 'px';
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    // Touch Support
    header.addEventListener('touchstart', (e) => {
        if (e.target.classList.contains('tbtn') || win.dataset.maximized === "true" || window.innerWidth <= 600) return;
        isDragging = true;
        bringToFront(win.id);
        const rect = win.getBoundingClientRect();
        const touch = e.touches[0];
        offsetX = touch.clientX - rect.left;
        offsetY = touch.clientY - rect.top;
    }, {passive: true});

    document.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        const touch = e.touches[0];
        
        let newX = touch.clientX - offsetX;
        let newY = touch.clientY - offsetY;
        newY = Math.max(0, newY);
        
        win.style.left = newX + 'px';
        win.style.top = newY + 'px';
    }, {passive: true});

    document.addEventListener('touchend', () => {
        isDragging = false;
    });
});

// Init taskbar
updateTaskbar();

// Github API Fetcher
async function fetchGithubRepos() {
    const container = document.getElementById('github-repos');
    const counter = document.getElementById('repo-count');
    
    container.innerHTML = `
        <div style="text-align:center; padding: 20px;">
            <img src="https://win98icons.alexmeub.com/icons/png/search_computer-0.png" class="rotating-icon" alt="Loading">
            <p>Pobieranie danych z Github API...</p>
        </div>
    `;
    
    try {
        const res = await fetch('https://api.github.com/users/wisniabobo/repos?sort=updated');
        if (!res.ok) throw new Error('API Error');
        const repos = await res.json();
        
        container.innerHTML = '';
        counter.innerText = `Znaleziono: ${repos.length} obiektów`;
        
        if (repos.length === 0) {
            container.innerHTML = '<p style="padding:10px;">Brak publicznych repozytoriów.</p>';
            return;
        }

        repos.forEach(repo => {
            const date = new Date(repo.updated_at).toLocaleDateString();
            const desc = repo.description || 'Brak opisu (Kolejny tajny projekt!)';
            const lang = repo.language ? `[${repo.language}]` : '';
            
            container.innerHTML += `
                <div style="border-bottom: 1px dotted #808080; padding: 5px; margin-bottom: 5px; display: flex; align-items: flex-start; gap: 8px;">
                    <img src="https://win98icons.alexmeub.com/icons/png/file_lines-0.png" alt="file" style="margin-top:2px;">
                    <div>
                        <a href="${repo.html_url}" target="_blank" style="color: #000080; font-weight: bold; text-decoration: underline;">${repo.name}</a> ${lang}
                        <p style="margin: 2px 0; color: #333; font-size: 11px;">${desc}</p>
                        <p style="margin: 0; color: #666; font-size: 10px;">Ostatnia modyfikacja: ${date}</p>
                    </div>
                </div>
            `;
        });
        
    } catch (error) {
        container.innerHTML = `
            <div style="text-align:center; padding: 20px; color: red;">
                <img src="https://win98icons.alexmeub.com/icons/png/msg_error-0.png" alt="Error">
                <p>Błąd połączenia z API Github.</p>
                <p style="font-size:10px;">Może limit zapytań został wyczerpany?</p>
            </div>
        `;
    }
}

// Automatically fetch when window is opened
const originalOpenWindow = openWindow;
openWindow = function(id) {
    originalOpenWindow(id);
    if (id === 'github-window') {
        const container = document.getElementById('github-repos');
        // fetch only if it hasn't been fetched yet
        if (container.innerHTML.includes('Nawiązywanie połączenia')) {
            fetchGithubRepos();
        }
    }
};
