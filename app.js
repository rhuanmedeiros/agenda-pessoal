/**
 * Agenda de Trabalho - Application Logic
 * Offline-first, mobile-first day logger & paint service calculator
 */

// --- STATE MANAGEMENT ---
let appState = {
  events: {}, // key: 'YYYY-MM-DD', value: { type: 'father'|'own'|'off', service: null, helper: null }
  settings: {
    baseSalary: 3000,
    dayRate: 150,
    helperRate: 120, // default wage for helper/father when working with you
    calcMethod: 'deduction', // 'deduction' | 'accumulation'
    theme: 'dark'
  }
};

// Current calendar date pointer
let currentDate = new Date();

// Active tab tracking
let activeTab = 'tab-calendar';

// Month names in Portuguese
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// --- LOCAL STORAGE FUNCTIONS ---
function loadState() {
  const savedState = localStorage.getItem('agenda_pessoal_state');
  if (savedState) {
    try {
      const parsed = JSON.parse(savedState);
      if (parsed.events) appState.events = parsed.events;
      if (parsed.settings) appState.settings = { ...appState.settings, ...parsed.settings };
    } catch (e) {
      console.error("Erro ao carregar dados do localStorage:", e);
    }
  }
  
  // Set default helperRate if it doesn't exist (backwards compatibility)
  if (appState.settings.helperRate === undefined) {
    appState.settings.helperRate = 120;
  }
  
  // Apply theme
  if (appState.settings.theme === 'light') {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
    document.body.classList.add('dark-theme');
  }
}

function saveState() {
  localStorage.setItem('agenda_pessoal_state', JSON.stringify(appState));
}

// Helper to show custom toast notifications
function showToast(message) {
  const toast = document.getElementById('toast-notification');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Helper: Format Date to Portuguese String (e.g., "12 de Junho de 2026")
function formatDateLong(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return `${day} de ${MONTH_NAMES[month - 1]} de ${year}`;
}

// Helper: Format currency to BRL
function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

// Helper: Get local YYYY-MM-DD date string
function getLocalDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// --- CALENDAR ENGINE ---
function renderCalendar() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  
  // Update header text
  document.getElementById('current-month-display').textContent = `${MONTH_NAMES[month]} ${year}`;
  
  const daysGrid = document.getElementById('calendar-days-grid');
  daysGrid.innerHTML = '';
  
  // First day of month (0 = Sunday, 1 = Monday, etc.)
  const firstDayIndex = new Date(year, month, 1).getDay();
  
  // Total days in current month
  const totalDays = new Date(year, month + 1, 0).getDate();
  
  // Render empty day spaces for offset
  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement('div');
    emptyCell.classList.add('day-cell', 'empty-day');
    daysGrid.appendChild(emptyCell);
  }
  
  // Today's date info
  const today = new Date();
  const todayStr = getLocalDateString(today);
  
  // Render month days
  for (let day = 1; day <= totalDays; day++) {
    const dayBtn = document.createElement('button');
    dayBtn.classList.add('day-cell');
    dayBtn.textContent = day;
    
    // Construct local YYYY-MM-DD string
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    dayBtn.dataset.date = dateStr;
    
    // Highlight today
    if (dateStr === todayStr) {
      dayBtn.classList.add('today-cell');
    }
    
    // Check if event exists for this day
    const event = appState.events[dateStr];
    if (event) {
      if (event.type === 'father') dayBtn.classList.add('work-father');
      if (event.type === 'own') dayBtn.classList.add('work-own');
      if (event.type === 'off') dayBtn.classList.add('work-off');
      
      // Indicators below day number
      const indicatorsContainer = document.createElement('div');
      indicatorsContainer.classList.add('day-indicators-container');
      
      // If there is painting service details
      if (event.service && event.service.client) {
        const dot = document.createElement('span');
        dot.classList.add('service-dot');
        indicatorsContainer.appendChild(dot);
      }
      
      // If there is helper details (Father or someone else helped)
      if (event.helper) {
        const helperDot = document.createElement('span');
        helperDot.classList.add('helper-dot');
        indicatorsContainer.appendChild(helperDot);
      }
      
      if (indicatorsContainer.children.length > 0) {
        dayBtn.appendChild(indicatorsContainer);
      }
    }
    
    // Click action opens editor modal
    dayBtn.addEventListener('click', () => openDayModal(dateStr));
    daysGrid.appendChild(dayBtn);
  }
  
  updateQuickOverview();
}

// Update the quick counters below the calendar
function updateQuickOverview() {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  
  let countFather = 0;
  let countOwn = 0;
  let countOff = 0;
  
  Object.keys(appState.events).forEach(dateStr => {
    if (dateStr.startsWith(monthPrefix)) {
      const type = appState.events[dateStr].type;
      if (type === 'father') countFather++;
      if (type === 'own') countOwn++;
      if (type === 'off') countOff++;
    }
  });
  
  document.getElementById('quick-count-father').textContent = `${countFather} ${countFather === 1 ? 'dia' : 'dias'}`;
  document.getElementById('quick-count-own').textContent = `${countOwn} ${countOwn === 1 ? 'dia' : 'dias'}`;
  document.getElementById('quick-count-off').textContent = `${countOff} ${countOff === 1 ? 'dia' : 'dias'}`;
}

// --- MODAL ENGINE (DAY LOGGER) ---
let selectedModalDate = '';

function openDayModal(dateStr) {
  selectedModalDate = dateStr;
  
  // Set Modal Date Header
  document.getElementById('modal-date-title').textContent = formatDateLong(dateStr);
  
  const event = appState.events[dateStr];
  
  // Reset form elements
  document.getElementById('srv-client').value = '';
  document.getElementById('srv-description').value = '';
  document.getElementById('srv-value').value = '';
  document.getElementById('srv-status').value = 'pending';
  
  // Reset helper elements
  const helperCheckbox = document.getElementById('srv-has-helper');
  helperCheckbox.checked = false;
  document.getElementById('srv-helper-name').value = 'father';
  document.getElementById('srv-helper-rate').value = appState.settings.helperRate;
  document.getElementById('helper-details-fields').classList.remove('active');
  
  // Pre-fill fields if event exists
  if (event) {
    // Select radio button
    const radio = document.querySelector(`input[name="modal-work-type"][value="${event.type}"]`);
    if (radio) radio.checked = true;
    
    // Toggle service fields visibility
    toggleServiceFields(event.type);
    
    // Pre-fill service details if they exist
    if (event.service) {
      document.getElementById('srv-client').value = event.service.client || '';
      document.getElementById('srv-description').value = event.service.description || '';
      document.getElementById('srv-value').value = event.service.value || '';
      document.getElementById('srv-status').value = event.service.status || 'pending';
    }
    
    // Pre-fill helper details if they exist
    if (event.helper) {
      helperCheckbox.checked = true;
      document.getElementById('srv-helper-name').value = event.helper.name || 'father';
      document.getElementById('srv-helper-rate').value = event.helper.rate || appState.settings.helperRate;
      document.getElementById('helper-details-fields').classList.add('active');
    }
    
    // Show delete button
    document.getElementById('modal-delete-day-btn').style.display = 'block';
  } else {
    // Default form setup for new entry
    document.querySelector('input[name="modal-work-type"][value="father"]').checked = true;
    toggleServiceFields('father');
    document.getElementById('modal-delete-day-btn').style.display = 'none';
  }
  
  // Open modal screen
  document.getElementById('day-modal').classList.add('active');
}

function closeDayModal() {
  document.getElementById('day-modal').classList.remove('active');
}

function toggleServiceFields(workType) {
  const serviceFields = document.getElementById('painting-service-fields');
  if (workType === 'own') {
    serviceFields.classList.add('active');
  } else {
    serviceFields.classList.remove('active');
  }
}

// --- SERVICES TAB ENGINE ---
function renderServices() {
  const container = document.getElementById('services-list-container');
  container.innerHTML = '';
  
  const searchQuery = document.getElementById('service-search-input').value.toLowerCase().trim();
  const filterMonth = document.getElementById('service-filter-month').value;
  const filterStatus = document.getElementById('service-filter-status').value;
  
  // Extract all own-work events with service info
  let services = [];
  Object.keys(appState.events).forEach(dateStr => {
    const event = appState.events[dateStr];
    if (event.type === 'own' && event.service) {
      services.push({
        date: dateStr,
        ...event.service
      });
    }
  });
  
  // Sort services by date descending
  services.sort((a, b) => b.date.localeCompare(a.date));
  
  // Filter services
  let filteredServices = services.filter(srv => {
    // Search query match (Client or Description)
    const clientMatch = srv.client && srv.client.toLowerCase().includes(searchQuery);
    const descMatch = srv.description && srv.description.toLowerCase().includes(searchQuery);
    const matchesSearch = searchQuery === '' || clientMatch || descMatch;
    
    // Month match (filterMonth: 'all' or 'YYYY-MM')
    const matchesMonth = filterMonth === 'all' || srv.date.startsWith(filterMonth);
    
    // Status match (filterStatus: 'all', 'paid', 'pending')
    const matchesStatus = filterStatus === 'all' || srv.status === filterStatus;
    
    return matchesSearch && matchesMonth && matchesStatus;
  });
  
  if (filteredServices.length === 0) {
    container.innerHTML = `
      <div class="no-data-alert card">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <p>Nenhum serviço de pintura encontrado com os filtros atuais.</p>
      </div>
    `;
    return;
  }
  
  // Render cards
  filteredServices.forEach(srv => {
    const card = document.createElement('div');
    card.classList.add('service-item-card');
    card.dataset.date = srv.date;
    
    const formattedDate = formatDateLong(srv.date);
    const valueBRL = formatCurrency(srv.value);
    const statusText = srv.status === 'paid' ? 'Pago' : 'Pendente';
    const statusClass = srv.status === 'paid' ? 'status-paid' : 'status-pending';
    
    card.innerHTML = `
      <div class="service-item-header">
        <div class="service-title-container">
          <span class="service-date">${formattedDate}</span>
          <h4 class="service-client">${srv.client || 'Sem nome do cliente'}</h4>
        </div>
        <span class="status-badge ${statusClass}">${statusText}</span>
      </div>
      ${srv.description ? `<p class="service-desc">${srv.description}</p>` : ''}
      <div class="service-footer">
        <span class="service-value-lbl">Valor do serviço:</span>
        <span class="service-value">${valueBRL}</span>
      </div>
    `;
    
    // Click card to edit this event in calendar view
    card.addEventListener('click', () => {
      openDayModal(srv.date);
    });
    
    container.appendChild(card);
  });
}

// Populate service filter dropdowns dynamically based on recorded dates
function updateServiceFilterDropdowns() {
  const monthSelect = document.getElementById('service-filter-month');
  const activeMonthValue = monthSelect.value || 'all';
  
  // Extract unique Year-Month combinations from events
  const monthsSet = new Set();
  Object.keys(appState.events).forEach(dateStr => {
    monthsSet.add(dateStr.substring(0, 7)); // 'YYYY-MM'
  });
  
  const sortedMonths = Array.from(monthsSet).sort().reverse();
  
  let html = '<option value="all">Todos os Meses</option>';
  sortedMonths.forEach(ym => {
    const [year, month] = ym.split('-');
    html += `<option value="${ym}">${MONTH_NAMES[Number(month) - 1]} ${year}</option>`;
  });
  
  monthSelect.innerHTML = html;
  
  // Retain selection if valid
  if (sortedMonths.includes(activeMonthValue) || activeMonthValue === 'all') {
    monthSelect.value = activeMonthValue;
  } else {
    monthSelect.value = 'all';
  }
}

// --- REPORTS TAB ENGINE ---
function renderReports() {
  const selectedYM = document.getElementById('report-month-select').value;
  if (!selectedYM) return;
  
  // Constants
  const baseSalary = appState.settings.baseSalary;
  const dayRate = appState.settings.dayRate;
  const calcMethod = appState.settings.calcMethod;
  
  // Counts
  let countFather = 0;
  let countOwn = 0;
  let countOff = 0;
  
  // Helper calculations
  let helperFatherCount = 0;
  let helperFatherTotal = 0;
  let helperOtherCount = 0;
  let helperOtherTotal = 0;
  let helperTotal = 0;
  
  // Own Services sums
  let ownPaidSum = 0;
  let ownPendingSum = 0;
  
  // Loop through events for selected month
  Object.keys(appState.events).forEach(dateStr => {
    if (dateStr.startsWith(selectedYM)) {
      const event = appState.events[dateStr];
      if (event.type === 'father') countFather++;
      if (event.type === 'own') {
        countOwn++;
        if (event.service) {
          const val = Number(event.service.value) || 0;
          if (event.service.status === 'paid') {
            ownPaidSum += val;
          } else {
            ownPendingSum += val;
          }
        }
      }
      if (event.type === 'off') countOff++;
      
      // Calculate helper diárias
      if (event.helper) {
        const hRate = Number(event.helper.rate) || 0;
        if (event.helper.name === 'father') {
          helperFatherCount++;
          helperFatherTotal += hRate;
        } else {
          helperOtherCount++;
          helperOtherTotal += hRate;
        }
        helperTotal += hRate;
      }
    }
  });
  
  // Total logged days this month
  const totalDaysLogged = countFather + countOwn + countOff;
  
  // 1. Stacked Bar Chart update
  const barFather = document.getElementById('bar-father');
  const barOwn = document.getElementById('bar-own');
  const barOff = document.getElementById('bar-off');
  
  if (totalDaysLogged > 0) {
    barFather.style.width = `${(countFather / totalDaysLogged) * 100}%`;
    barOwn.style.width = `${(countOwn / totalDaysLogged) * 100}%`;
    barOff.style.width = `${(countOff / totalDaysLogged) * 100}%`;
  } else {
    barFather.style.width = '0%';
    barOwn.style.width = '0%';
    barOff.style.width = '0%';
  }
  
  document.getElementById('chart-lbl-father').textContent = countFather;
  document.getElementById('chart-lbl-own').textContent = countOwn;
  document.getElementById('chart-lbl-off').textContent = countOff;
  
  // 2. Father Salary calculations
  let netFatherSalary = 0;
  let deductionsCount = 0;
  let deductionsTotal = 0;
  
  // Update UI values
  document.getElementById('rep-base-salary').textContent = formatCurrency(baseSalary);
  
  if (calcMethod === 'deduction') {
    // Deduct days worked on own (off days / holidays are not deducted)
    deductionsCount = countOwn;
    deductionsTotal = deductionsCount * dayRate;
    netFatherSalary = Math.max(0, baseSalary - deductionsTotal);
    
    document.getElementById('rep-days-off-count').textContent = deductionsCount;
    document.getElementById('rep-deductions').textContent = `- ${formatCurrency(deductionsTotal)}`;
    
    const explanation = document.querySelector('.calc-explanation');
    explanation.textContent = `Modo Desconto: Subtrai ${deductionsCount} dias por conta no valor diário de ${formatCurrency(dayRate)} do salário base de ${formatCurrency(baseSalary)}.`;
  } else {
    // Accumulation mode: sum days worked for father
    netFatherSalary = countFather * dayRate;
    deductionsCount = 0;
    deductionsTotal = 0;
    
    document.getElementById('rep-days-off-count').textContent = 0;
    document.getElementById('rep-deductions').textContent = formatCurrency(0);
    
    const explanation = document.querySelector('.calc-explanation');
    explanation.textContent = `Modo Acumulação: Multiplica ${countFather} dias trabalhados com o pai pelo valor da diária de ${formatCurrency(dayRate)}.`;
  }
  
  document.getElementById('rep-father-final').textContent = formatCurrency(netFatherSalary);
  
  // 3. Own Painting Services Calculations
  const ownTotalSum = ownPaidSum + ownPendingSum;
  document.getElementById('rep-own-paid').textContent = formatCurrency(ownPaidSum);
  document.getElementById('rep-own-pending').textContent = formatCurrency(ownPendingSum);
  document.getElementById('rep-own-total').textContent = formatCurrency(ownTotalSum);
  
  // 4. Helpers / Partner calculation UI updates
  document.getElementById('rep-helper-father-count').textContent = helperFatherCount;
  document.getElementById('rep-helper-father-total').textContent = formatCurrency(helperFatherTotal);
  document.getElementById('rep-helper-other-count').textContent = helperOtherCount;
  document.getElementById('rep-helper-other-total').textContent = formatCurrency(helperOtherTotal);
  document.getElementById('rep-helper-total').textContent = formatCurrency(helperTotal);
  
  // 5. Combined Monthly Consolidation (Deducting helper cost)
  const grandTotal = netFatherSalary + ownPaidSum - helperTotal; // physically received net profit
  const grandTotalWithPending = netFatherSalary + ownTotalSum - helperTotal; // potential net profit
  
  document.getElementById('rep-grand-total').textContent = formatCurrency(grandTotal);
  document.getElementById('rep-grand-total-with-pending').textContent = formatCurrency(grandTotalWithPending);
}

// Populate the report month selector dropdown
function updateReportMonthDropdown() {
  const monthSelect = document.getElementById('report-month-select');
  const activeValue = monthSelect.value || '';
  
  // Generate all months starting from current date, and include any month that has events
  const monthsSet = new Set();
  
  // Always include current month
  const currentYM = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
  monthsSet.add(currentYM);
  
  // Add months from events
  Object.keys(appState.events).forEach(dateStr => {
    monthsSet.add(dateStr.substring(0, 7));
  });
  
  const sortedMonths = Array.from(monthsSet).sort().reverse();
  
  let html = '';
  sortedMonths.forEach(ym => {
    const [year, month] = ym.split('-');
    html += `<option value="${ym}">${MONTH_NAMES[Number(month) - 1]} ${year}</option>`;
  });
  
  monthSelect.innerHTML = html;
  
  if (activeValue && sortedMonths.includes(activeValue)) {
    monthSelect.value = activeValue;
  } else {
    monthSelect.value = currentYM;
  }
}

// --- SETTINGS ENGINE ---
function loadSettingsToUI() {
  document.getElementById('cfg-base-salary').value = appState.settings.baseSalary;
  document.getElementById('cfg-day-rate').value = appState.settings.dayRate;
  document.getElementById('cfg-helper-rate').value = appState.settings.helperRate !== undefined ? appState.settings.helperRate : 120;
  document.getElementById('cfg-calc-method').value = appState.settings.calcMethod;
}

function saveSettingsFromUI() {
  const baseSal = Number(document.getElementById('cfg-base-salary').value);
  const dayRate = Number(document.getElementById('cfg-day-rate').value);
  const helperRate = Number(document.getElementById('cfg-helper-rate').value);
  const method = document.getElementById('cfg-calc-method').value;
  
  if (isNaN(baseSal) || baseSal < 0 || isNaN(dayRate) || dayRate < 0 || isNaN(helperRate) || helperRate < 0) {
    showToast("⚠️ Insira valores válidos nas configurações!");
    return;
  }
  
  appState.settings.baseSalary = baseSal;
  appState.settings.dayRate = dayRate;
  appState.settings.helperRate = helperRate;
  appState.settings.calcMethod = method;
  
  saveState();
  showToast("✅ Configurações salvas com sucesso!");
  
  // Refresh views that depend on settings
  if (activeTab === 'tab-reports') renderReports();
}

// --- IMPORT & EXPORT (BACKUP) ---
function exportBackup() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 2));
  const downloadAnchor = document.createElement('a');
  
  const now = new Date();
  const dateSuffix = `${now.getFullYear()}_${String(now.getMonth()+1).padStart(2,'0')}_${String(now.getDate()).padStart(2,'0')}`;
  
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `agenda_trabalho_backup_${dateSuffix}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
  
  showToast("💾 Backup exportado com sucesso!");
}

function triggerImport() {
  document.getElementById('import-file-input').click();
}

function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(event) {
    try {
      const parsed = JSON.parse(event.target.result);
      
      // Verification check
      if (parsed && typeof parsed === 'object') {
        if (parsed.events) appState.events = { ...appState.events, ...parsed.events };
        if (parsed.settings) appState.settings = { ...appState.settings, ...parsed.settings };
        
        saveState();
        showToast("📥 Backup restaurado com sucesso!");
        
        // Refresh all elements
        renderCalendar();
        updateServiceFilterDropdowns();
        updateReportMonthDropdown();
        renderServices();
        renderReports();
        loadSettingsToUI();
        
        // Toggle theme if it changed
        if (appState.settings.theme === 'light') {
          document.body.classList.add('light-theme');
          document.body.classList.remove('dark-theme');
        } else {
          document.body.classList.add('dark-theme');
          document.body.classList.remove('light-theme');
        }
      } else {
        showToast("❌ Arquivo de backup inválido.");
      }
    } catch (err) {
      showToast("❌ Erro ao ler arquivo de backup.");
      console.error(err);
    }
  };
  reader.readAsText(file);
  e.target.value = ''; // Reset file input
}

function clearAllData() {
  const confirmFirst = confirm("Tem certeza absoluta que deseja apagar TODOS os seus registros de dias e serviços? Esta ação não pode ser desfeita!");
  if (!confirmFirst) return;
  
  const confirmSecond = confirm("Último aviso: Todos os dados serão deletados permanentemente da memória do celular. Deseja prosseguir?");
  if (!confirmSecond) return;
  
  appState.events = {};
  saveState();
  
  renderCalendar();
  updateServiceFilterDropdowns();
  updateReportMonthDropdown();
  renderServices();
  renderReports();
  
  showToast("🗑️ Todos os dados foram removidos.");
}

// --- APP LIFECYCLE & EVENT BINDINGS ---
document.addEventListener('DOMContentLoaded', () => {
  // 1. Initial State Loading
  loadState();
  
  // 2. Render initial views
  renderCalendar();
  updateServiceFilterDropdowns();
  updateReportMonthDropdown();
  loadSettingsToUI();
  
  // 3. Tab Switching Setup
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      // Toggle nav visual active state
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      
      // Hide all tabs and show target tab
      const target = item.dataset.tab;
      activeTab = target;
      
      document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
      });
      document.getElementById(target).classList.add('active');
      
      // Tab-specific loading actions
      if (target === 'tab-calendar') {
        renderCalendar();
      } else if (target === 'tab-services') {
        updateServiceFilterDropdowns();
        renderServices();
      } else if (target === 'tab-reports') {
        updateReportMonthDropdown();
        renderReports();
      } else if (target === 'tab-config') {
        loadSettingsToUI();
      }
    });
  });
  
  // 4. Calendar Month Navigation
  document.getElementById('prev-month-btn').addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });
  
  document.getElementById('next-month-btn').addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });
  
  // 5. Theme Toggle handler
  document.getElementById('theme-toggle-btn').addEventListener('click', () => {
    if (document.body.classList.contains('dark-theme')) {
      document.body.classList.remove('dark-theme');
      document.body.classList.add('light-theme');
      appState.settings.theme = 'light';
    } else {
      document.body.classList.remove('light-theme');
      document.body.classList.add('dark-theme');
      appState.settings.theme = 'dark';
    }
    saveState();
  });
  
  // 6. Modal Interactions
  document.getElementById('modal-close-btn').addEventListener('click', closeDayModal);
  document.getElementById('modal-cancel-btn').addEventListener('click', closeDayModal);
  
  // Close modal when tapping overlay background
  document.getElementById('day-modal').addEventListener('click', (e) => {
    if (e.target.id === 'day-modal') closeDayModal();
  });
  
  // Listen for work type radio checks to toggle services form inputs
  const workTypeRadios = document.querySelectorAll('input[name="modal-work-type"]');
  workTypeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      toggleServiceFields(e.target.value);
    });
  });
  
  // Listen to helper checkbox toggle
  document.getElementById('srv-has-helper').addEventListener('change', (e) => {
    const fields = document.getElementById('helper-details-fields');
    if (e.target.checked) {
      fields.classList.add('active');
    } else {
      fields.classList.remove('active');
    }
  });
  
  // Modal Save Button Handler
  document.getElementById('modal-save-btn').addEventListener('click', () => {
    const workType = document.querySelector('input[name="modal-work-type"]:checked').value;
    
    // Save service info
    let serviceData = null;
    if (workType === 'own') {
      const client = document.getElementById('srv-client').value.trim();
      const desc = document.getElementById('srv-description').value.trim();
      const val = Number(document.getElementById('srv-value').value);
      const status = document.getElementById('srv-status').value;
      
      if (!client) {
        showToast("⚠️ Por favor, informe o nome do cliente ou casa!");
        return;
      }
      
      serviceData = {
        client: client,
        description: desc,
        value: isNaN(val) ? 0 : val,
        status: status
      };
    }
    
    // Save helper info
    let helperData = null;
    const hasHelper = document.getElementById('srv-has-helper').checked;
    if (hasHelper) {
      const hName = document.getElementById('srv-helper-name').value;
      const hRate = Number(document.getElementById('srv-helper-rate').value);
      helperData = {
        name: hName,
        rate: isNaN(hRate) ? appState.settings.helperRate : hRate
      };
    }
    
    // Save to State
    appState.events[selectedModalDate] = {
      type: workType,
      service: serviceData,
      helper: helperData
    };
    
    saveState();
    closeDayModal();
    showToast("📝 Dia registrado com sucesso!");
    
    // Refresh active tab views
    if (activeTab === 'tab-calendar') {
      renderCalendar();
    } else if (activeTab === 'tab-services') {
      renderServices();
    } else if (activeTab === 'tab-reports') {
      renderReports();
    }
  });
  
  // Modal Delete Button Handler
  document.getElementById('modal-delete-day-btn').addEventListener('click', () => {
    if (confirm("Remover o registro deste dia?")) {
      delete appState.events[selectedModalDate];
      saveState();
      closeDayModal();
      showToast("🗑️ Registro removido.");
      
      // Refresh views
      if (activeTab === 'tab-calendar') {
        renderCalendar();
      } else if (activeTab === 'tab-services') {
        renderServices();
      } else if (activeTab === 'tab-reports') {
        renderReports();
      }
    }
  });
  
  // 7. Services Filters and Search listeners
  document.getElementById('service-search-input').addEventListener('input', renderServices);
  document.getElementById('service-filter-month').addEventListener('change', renderServices);
  document.getElementById('service-filter-status').addEventListener('change', renderServices);
  
  // "+ Novo Serviço" button opens modal for today or first day
  document.getElementById('add-service-btn').addEventListener('click', () => {
    const today = new Date();
    const todayStr = getLocalDateString(today);
    openDayModal(todayStr);
  });
  
  // 8. Reports Month Selector listener
  document.getElementById('report-month-select').addEventListener('change', renderReports);
  
  // 9. Settings actions
  document.getElementById('save-settings-btn').addEventListener('click', saveSettingsFromUI);
  document.getElementById('export-backup-btn').addEventListener('click', exportBackup);
  document.getElementById('import-backup-btn').addEventListener('click', triggerImport);
  document.getElementById('import-file-input').addEventListener('change', handleImportFile);
  document.getElementById('clear-all-data-btn').addEventListener('click', clearAllData);
});

// --- SERVICE WORKER REGISTRATION (PWA) ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('Service Worker registrado!', reg))
      .catch(err => console.warn('Erro ao registrar Service Worker:', err));
  });
}
