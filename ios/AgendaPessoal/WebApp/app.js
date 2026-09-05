/**
 * Agenda de Trabalho - Application Logic
 * Offline-first, mobile-first day logger & paint service calculator
 */

// --- STATE MANAGEMENT ---
// URLs do backend (Google Apps Script). Ao publicar uma nova IMPLANTAÇÃO, atualize aqui.
const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbwodc16Sbivl7kCKiB1GVZW4Z9T2jch2J4QEbmiwJUnDUq_49KhRYVcIMBqeI_3DcM3tw/exec';
// URLs antigas que devem ser migradas automaticamente para a atual
const OLD_SHEETS_URLS = [
  'https://script.google.com/macros/s/AKfycbwoP4oME9fvoj80WNT6Iriqx-KXd8fO-1nzPjvUFVyX6Bw5aHJtCv3QbJqBARUKZqorlw/exec'
];

let appState = {
  events: {}, // key: 'YYYY-MM-DD', value: { type: 'father'|'own'|'off'|'deleted', serviceId: null, helper: null, updatedAt: 0 }
  services: {}, // key: 'service_id', value: { id, client, address, contact, notes, description, value, valueReceived, status, updatedAt }
  settings: {
    fatherLabel: 'Com o Pai', // customizable label for the day type & reports
    dayRate: 150,
    helperRate: 120, // default wage for helper/boss when working with you
    calcMethod: 'offset', // 'offset' | 'sum_only'
    theme: 'dark',
    sheetsUrl: SHEETS_URL,
    lastSync: ''
  }
};

// Versão do app (sincronizada com o CACHE_NAME do sw.js). Suba a cada deploy.
const APP_VERSION = '1.4.0';

// Current calendar date pointer
let currentDate = new Date();

// Active tab tracking
let activeTab = 'tab-calendar';

// Month names in Portuguese
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// Helper: Custom label for "Com o Pai" / "Com Patrão"
function getFatherLabel() {
  return (appState.settings && appState.settings.fatherLabel && appState.settings.fatherLabel.trim()) || 'Com o Pai';
}

function getFatherShortName() {
  const full = getFatherLabel();
  const match = full.match(/^Com\s+(?:o\s+|a\s+)?(.+)$/i);
  if (match && match[1]) return match[1].trim();
  return full;
}

function applyDynamicLabels() {
  const fullLabel = getFatherLabel();
  const shortName = getFatherShortName();

  // 1. Modal Radio Title
  const modalRadioTitle = document.getElementById('modal-work-father-title');
  if (modalRadioTitle) modalRadioTitle.textContent = fullLabel;

  // 2. Modal Helper Select Option
  const modalHelperOpt = document.getElementById('modal-helper-father-opt');
  if (modalHelperOpt) modalHelperOpt.textContent = shortName;

  // 3. Legenda no Calendário
  const legendLabel = document.getElementById('legend-label-father');
  if (legendLabel) legendLabel.textContent = fullLabel;

  // 4. Relatórios
  const chartLbl = document.getElementById('chart-lbl-father-name');
  if (chartLbl) chartLbl.textContent = shortName;

  const repCardBadge = document.getElementById('rep-card-father-badge');
  if (repCardBadge) repCardBadge.textContent = fullLabel;

  const repCardTitle = document.getElementById('rep-card-father-title');
  if (repCardTitle) repCardTitle.textContent = `Diárias (${fullLabel})`;

  const repDaysName = document.getElementById('rep-father-days-label-name');
  if (repDaysName) repDaysName.textContent = fullLabel;

  const repOffsetName = document.getElementById('rep-offset-name-label');
  if (repOffsetName) repOffsetName.textContent = shortName;

  const repHelperLbl = document.getElementById('rep-helper-father-lbl');
  if (repHelperLbl) repHelperLbl.textContent = shortName;

  // 5. Configurações text spans
  document.querySelectorAll('.dynamic-father-name').forEach(el => el.textContent = fullLabel);
  document.querySelectorAll('.dynamic-father-short-name').forEach(el => el.textContent = shortName);
}

// --- LOCAL STORAGE FUNCTIONS ---
function loadState() {
  const savedState = localStorage.getItem('agenda_pessoal_state');
  if (savedState) {
    try {
      const parsed = JSON.parse(savedState);
      if (parsed.events) appState.events = parsed.events;
      if (parsed.services) appState.services = parsed.services;
      if (parsed.settings) appState.settings = { ...appState.settings, ...parsed.settings };
    } catch (e) {
      console.error("Erro ao carregar dados do localStorage:", e);
    }
  }
  
  if (!appState.settings.fatherLabel) {
    appState.settings.fatherLabel = 'Com o Pai';
  }
  if (appState.settings.helperRate === undefined) {
    appState.settings.helperRate = 120;
  }
  if (appState.settings.sheetsUrl === undefined) {
    appState.settings.sheetsUrl = '';
  }
  // Migra aparelhos com URL antiga (ou vazia) para o backend atual
  if (!appState.settings.sheetsUrl || OLD_SHEETS_URLS.includes(appState.settings.sheetsUrl.trim())) {
    appState.settings.sheetsUrl = SHEETS_URL;
  }
  if (appState.settings.lastSync === undefined) {
    appState.settings.lastSync = '';
  }
  
  // Run data migration for older structure to the new services model
  migrateOldState();
  
  // Apply theme
  if (appState.settings.theme === 'light') {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
    document.body.classList.add('dark-theme');
  }

  // Apply dynamic labels
  applyDynamicLabels();
}

function saveState() {
  localStorage.setItem('agenda_pessoal_state', JSON.stringify(appState));
  if (!window.isSyncingInProgress) {
    autoSync();
  }
}

function autoSync() {
  const sheetsUrl = appState.settings.sheetsUrl;
  if (!sheetsUrl || sheetsUrl.trim() === '') return;
  
  if (window.autoSyncTimeout) clearTimeout(window.autoSyncTimeout);
  window.autoSyncTimeout = setTimeout(() => {
    syncWithGoogleSheets(true);
  }, 1500);
}


function migrateOldState() {
  if (!appState.services) {
    appState.services = {};
  }
  
  let migratedCount = 0;
  const tempServicesMap = {}; // key: client_status, value: serviceId
  
  Object.keys(appState.events).forEach(dateStr => {
    const event = appState.events[dateStr];
    if (event && event.type !== 'deleted' && event.service && !event.serviceId) {
      const client = (event.service.client || "Sem Cliente").trim();
      const desc = event.service.description || "";
      const value = Number(event.service.value) || 0;
      const status = event.service.status || "pending";
      
      const key = `${client}_${status}`;
      
      let serviceId;
      if (tempServicesMap[key]) {
        serviceId = tempServicesMap[key];
        if (appState.services[serviceId].value === 0 && value > 0) {
          appState.services[serviceId].value = value;
        }
      } else {
        // Find if we already have a service with this client and description in state from previous sessions
        const existingSrvId = Object.keys(appState.services).find(id => {
          const s = appState.services[id];
          return s.client === client && s.status === status;
        });
        
        if (existingSrvId) {
          serviceId = existingSrvId;
          tempServicesMap[key] = serviceId;
          if (appState.services[serviceId].value === 0 && value > 0) {
            appState.services[serviceId].value = value;
          }
        } else {
          serviceId = `service_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          tempServicesMap[key] = serviceId;
          
          appState.services[serviceId] = {
            id: serviceId,
            client: client,
            description: desc,
            value: value,
            status: status,
            updatedAt: Date.now()
          };
          migratedCount++;
        }
      }
      
      event.serviceId = serviceId;
      delete event.service;
    }
  });

  // Garante os novos campos da obra em todos os serviços (compat com dados antigos)
  Object.keys(appState.services).forEach(id => {
    const s = appState.services[id];
    if (s.address === undefined) s.address = '';
    if (s.contact === undefined) s.contact = '';
    if (s.valueReceived === undefined) s.valueReceived = 0;
    if (s.materials === undefined) s.materials = [];
    // `notes` reaproveita a antiga `description`; mantém os dois espelhados por compat de sync
    if (s.notes === undefined) s.notes = s.description || '';
    if (s.description === undefined) s.description = s.notes || '';
  });

  if (migratedCount > 0) {
    console.log(`Migracao concluida: ${migratedCount} servicos legados criados.`);
    saveState();
  }
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

// Helper: Trigger native haptic feedback on iOS WKWebView or vibration on mobile browsers
function triggerHapticFeedback(type = 'light') {
  if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.nativeHaptic) {
    try {
      window.webkit.messageHandlers.nativeHaptic.postMessage(type);
    } catch (e) {}
  } else if (navigator.vibrate) {
    try {
      if (type === 'success') navigator.vibrate([25, 40, 25]);
      else if (type === 'error') navigator.vibrate([40, 80, 40]);
      else navigator.vibrate(20);
    } catch (e) {}
  }
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
    if (event && event.type !== 'deleted') {
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
  let countHelper = 0;
  
  Object.keys(appState.events).forEach(dateStr => {
    if (dateStr.startsWith(monthPrefix)) {
      const event = appState.events[dateStr];
      if (event && event.type !== 'deleted') {
        const type = event.type;
        if (type === 'father') countFather++;
        if (type === 'own') countOwn++;
        if (type === 'off') countOff++;
        if (event.helper) countHelper++;
      }
    }
  });
  
  const fatherEl = document.getElementById('quick-count-father');
  if (fatherEl) fatherEl.textContent = `${countFather} ${countFather === 1 ? 'dia' : 'dias'}`;

  const ownEl = document.getElementById('quick-count-own');
  if (ownEl) ownEl.textContent = `${countOwn} ${countOwn === 1 ? 'dia' : 'dias'}`;

  const helperEl = document.getElementById('quick-count-helper');
  if (helperEl) helperEl.textContent = `${countHelper} ${countHelper === 1 ? 'dia' : 'dias'}`;

  const offEl = document.getElementById('quick-count-off');
  if (offEl) offEl.textContent = `${countOff} ${countOff === 1 ? 'dia' : 'dias'}`;
}

// --- MODAL ENGINE (DAY LOGGER) ---
let selectedModalDate = '';

function openDayModal(dateStr) {
  selectedModalDate = dateStr;
  applyDynamicLabels();
  
  // Set Modal Date Header
  document.getElementById('modal-date-title').textContent = formatDateLong(dateStr);
  
  const event = appState.events[dateStr];
  
  // Reset form elements
  const srvSelect = document.getElementById('srv-select');
  srvSelect.innerHTML = '<option value="none">Nenhum (Apenas registrar dia de diária)</option><option value="new">+ Criar Novo Serviço...</option>';
  
  // Populate srvSelect with all pending (active) services + the current day's service (even if paid)
  const sortedServices = Object.values(appState.services)
    .filter(s => s.status !== 'deleted')
    .sort((a, b) => a.client.localeCompare(b.client));
    
  sortedServices.forEach(s => {
    // Only include if it's pending OR if it's already selected on this event
    const isSelected = event && event.serviceId === s.id;
    if (s.status === 'pending' || isSelected) {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = (s.client || 'Sem nome') + (s.status === 'paid' ? ' [Finalizado]' : '');
      srvSelect.appendChild(opt);
    }
  });

  // Clear new service input fields
  document.getElementById('srv-client').value = '';
  document.getElementById('srv-value').value = '';
  document.getElementById('srv-status').value = 'pending';
  document.getElementById('new-service-fields').style.display = 'none';
  
  // Reset helper elements
  const helperCheckbox = document.getElementById('srv-has-helper');
  helperCheckbox.checked = false;
  document.getElementById('srv-helper-name').value = 'father';
  document.getElementById('srv-helper-rate').value = appState.settings.helperRate;
  document.getElementById('helper-details-fields').classList.remove('active');
  
  // Reset daily description
  document.getElementById('day-description').value = '';
  
  // Pre-fill fields if event exists
  if (event && event.type !== 'deleted') {
    // Select radio button
    const radio = document.querySelector(`input[name="modal-work-type"][value="${event.type}"]`);
    if (radio) radio.checked = true;
    
    // Toggle service fields visibility
    toggleServiceFields(event.type);
    
    // Pre-select service
    if (event.serviceId && appState.services[event.serviceId]) {
      srvSelect.value = event.serviceId;
    } else {
      srvSelect.value = 'none';
    }
    
    // Pre-fill helper details if they exist
    if (event.helper) {
      helperCheckbox.checked = true;
      document.getElementById('srv-helper-name').value = event.helper.name || 'father';
      document.getElementById('srv-helper-rate').value = event.helper.rate || appState.settings.helperRate;
      document.getElementById('helper-details-fields').classList.add('active');
    }
    
    // Pre-fill daily description
    document.getElementById('day-description').value = event.description || '';
    
    // Show delete button
    document.getElementById('modal-delete-day-btn').style.display = 'block';
  } else {
    // Default form setup for new entry (Por Conta por padrão)
    const defaultRadio = document.querySelector('input[name="modal-work-type"][value="own"]');
    if (defaultRadio) defaultRadio.checked = true;
    toggleServiceFields('own');
    srvSelect.value = 'none';
    document.getElementById('day-description').value = '';
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
  if (workType === 'own' || workType === 'father') {
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
  
  // Mapear dias trabalhados para cada serviço
  const serviceDaysMap = {}; // key: serviceId, value: Array de dateStr
  Object.keys(appState.events).forEach(dateStr => {
    const event = appState.events[dateStr];
    if (event && event.type !== 'deleted' && event.serviceId) {
      if (!serviceDaysMap[event.serviceId]) {
        serviceDaysMap[event.serviceId] = [];
      }
      serviceDaysMap[event.serviceId].push(dateStr);
    }
  });
  
  let servicesList = [];
  
  Object.keys(appState.services).forEach(id => {
    const srv = appState.services[id];
    if (srv.status === 'deleted') return;
    
    const days = serviceDaysMap[id] || [];
    days.sort(); // Ordenar dias do serviço por ordem cronológica crescente
    
    // Data de referência (mais recente) ou data de modificação
    let refDate = "";
    if (days.length > 0) {
      refDate = days[days.length - 1];
    } else {
      const updatedDate = new Date(srv.updatedAt || Date.now());
      refDate = getLocalDateString(updatedDate);
    }
    
    servicesList.push({
      ...srv,
      days: days,
      refDate: refDate
    });
  });
  
  // Ordenar serviços: pendentes primeiro, e depois por data de referência decrescente
  servicesList.sort((a, b) => {
    if (a.status === 'pending' && b.status === 'paid') return -1;
    if (a.status === 'paid' && b.status === 'pending') return 1;
    return b.refDate.localeCompare(a.refDate);
  });
  
  // Filtrar serviços
  let filteredServices = servicesList.filter(srv => {
    const clientMatch = srv.client && srv.client.toLowerCase().includes(searchQuery);
    const descMatch = (srv.description || srv.notes || '').toLowerCase().includes(searchQuery);
    const matchesSearch = searchQuery === '' || clientMatch || descMatch;
    
    const matchesMonth = filterMonth === 'all' || srv.refDate.startsWith(filterMonth);
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
  
  // Renderizar os cards em estado FECHADO por padrão
  filteredServices.forEach(srv => {
    const card = document.createElement('div');
    card.classList.add('service-item-card');
    
    const valueBRL = formatCurrency(srv.value);
    const statusText = srv.status === 'paid' ? 'Finalizado' : 'Pendente';
    const statusClass = srv.status === 'paid' ? 'status-paid' : 'status-pending';
    
    const daysCount = srv.days.length;
    const daysLabel = daysCount === 1 ? '1 dia trabalhado' : `${daysCount} dias trabalhados`;
    
    const materialsCount = (srv.materials || []).length;
    const materialsBadgeHTML = materialsCount > 0 
      ? `<span class="srv-materials-badge">🎨 ${materialsCount} ${materialsCount === 1 ? 'material' : 'materiais'}</span>` 
      : '';
    
    // Detalhes rápidos (Endereço/Contato)
    const metaParts = [];
    if (srv.address) metaParts.push(`📍 ${srv.address}`);
    if (srv.contact) metaParts.push(`📞 ${srv.contact}`);
    const metaHTML = metaParts.length > 0 
      ? `<div style="font-size: 0.76rem; color: var(--text-secondary); margin-top: 0.3rem;">${metaParts.join(' • ')}</div>` 
      : '';
    
    // Valores no rodapé do card fechado
    const received = Number(srv.valueReceived) || 0;
    const totalVal = Number(srv.value) || 0;
    let valueBlockHTML;
    if (received > 0) {
      const remaining = Math.max(totalVal - received, 0);
      valueBlockHTML = `
        <div class="service-preview-left">
          <span class="service-preview-days-lbl">Recebido ${formatCurrency(received)} de ${valueBRL}</span>
          <span style="font-weight: 700; font-size: 1.05rem; color: ${remaining > 0 ? 'var(--color-brand-orange)' : 'var(--color-brand-green)'};">
            ${remaining > 0 ? 'Falta ' + formatCurrency(remaining) : 'Quitado ✅'}
          </span>
        </div>`;
    } else {
      valueBlockHTML = `
        <div class="service-preview-left">
          <span class="service-preview-days-lbl">Valor do Serviço:</span>
          <span style="font-weight: 700; font-size: 1.05rem; color: var(--color-brand-green);">${valueBRL}</span>
        </div>`;
    }
    
    card.innerHTML = `
      <div class="service-item-header">
        <div class="service-title-container">
          <div class="service-title-row">
            <h4 class="service-client-name">${srv.client || 'Sem nome do cliente'}</h4>
            <span class="srv-days-badge">📅 ${daysLabel}</span>
            ${materialsBadgeHTML}
          </div>
          ${metaHTML}
        </div>
        <span class="status-badge ${statusClass}">${statusText}</span>
      </div>

      <div class="service-card-preview-info">
        ${valueBlockHTML}
        <div class="service-preview-right">
          <span class="srv-expand-hint">
            👁️ Ver detalhes / materiais &rarr;
          </span>
        </div>
      </div>
    `;
    
    // Clique no card abre o detalhamento completo do serviço
    card.addEventListener('click', () => {
      openServiceModal(srv.id);
    });

    container.appendChild(card);
  });
}

function changeServiceStatus(serviceId, newStatus) {
  if (appState.services[serviceId]) {
    appState.services[serviceId].status = newStatus;
    appState.services[serviceId].updatedAt = Date.now();
    saveState();
    showToast(newStatus === 'paid' ? "🎉 Serviço marcado como finalizado!" : "🔓 Serviço reaberto com sucesso!");
    renderServices();
  }
}

let selectedServiceId = '';

function switchServiceModalTab(tabId) {
  const modal = document.getElementById('service-modal');
  modal.querySelectorAll('.srv-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.srvTab === tabId);
  });
  modal.querySelectorAll('.srv-tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === tabId);
  });
}

function openServiceModal(serviceId) {
  selectedServiceId = serviceId;
  const srv = appState.services[serviceId];
  if (!srv) return;
  
  // Reset tab active
  switchServiceModalTab('srv-tab-general');

  document.getElementById('service-modal-title').textContent = srv.client || "Detalhes do Serviço";
  document.getElementById('edit-srv-client').value = srv.client || '';
  document.getElementById('edit-srv-address').value = srv.address || '';
  document.getElementById('edit-srv-contact').value = srv.contact || '';
  document.getElementById('edit-srv-description').value = srv.notes || srv.description || '';
  document.getElementById('edit-srv-value').value = srv.value || '';
  document.getElementById('edit-srv-value-received').value = srv.valueReceived || '';
  document.getElementById('edit-srv-status').value = srv.status || 'pending';

  // Carregar lista de dias e materiais para a modal
  renderServiceModalDaysTab(serviceId);
  renderServiceModalMaterialsTab(serviceId);
  updateServiceFinancialTab(serviceId);

  // Show delete button
  document.getElementById('service-modal-delete-btn').style.display = 'block';
  
  // Open modal
  document.getElementById('service-modal').classList.add('active');
}

function openNewServiceModal() {
  selectedServiceId = 'new';
  
  switchServiceModalTab('srv-tab-general');
  
  document.getElementById('service-modal-title').textContent = "Novo Serviço";
  document.getElementById('edit-srv-client').value = '';
  document.getElementById('edit-srv-address').value = '';
  document.getElementById('edit-srv-contact').value = '';
  document.getElementById('edit-srv-description').value = '';
  document.getElementById('edit-srv-value').value = '';
  document.getElementById('edit-srv-value-received').value = '';
  document.getElementById('edit-srv-status').value = 'pending';

  document.getElementById('srv-tab-days-count').textContent = '0';
  document.getElementById('srv-tab-mat-count').textContent = '0';
  document.getElementById('srv-days-list').innerHTML = '<p class="help-text">Salve o serviço primeiro para vincular dias de trabalho.</p>';
  document.getElementById('materials-items-list').innerHTML = '<p class="help-text">Salve o serviço primeiro para adicionar materiais.</p>';
  document.getElementById('mat-total-amount').textContent = 'R$ 0,00';

  // Hide delete button for new service
  document.getElementById('service-modal-delete-btn').style.display = 'none';
  
  // Open modal
  document.getElementById('service-modal').classList.add('active');
}

function closeServiceModal() {
  document.getElementById('service-modal').classList.remove('active');
}

// Renderiza a lista de dias trabalhados dentro do modal do serviço
function renderServiceModalDaysTab(serviceId) {
  const container = document.getElementById('srv-days-list');
  const countEl = document.getElementById('srv-tab-days-count');
  container.innerHTML = '';

  const days = [];
  Object.keys(appState.events).forEach(dateStr => {
    const ev = appState.events[dateStr];
    if (ev && ev.type !== 'deleted' && ev.serviceId === serviceId) {
      days.push({ date: dateStr, ...ev });
    }
  });

  days.sort((a, b) => b.date.localeCompare(a.date));
  countEl.textContent = days.length;

  if (days.length === 0) {
    container.innerHTML = `<p class="help-text">Nenhuma diária cadastrada para este serviço no calendário ainda.</p>`;
    return;
  }

  days.forEach(item => {
    const el = document.createElement('div');
    el.classList.add('srv-day-card-item');

    const [y, m, d] = item.date.split('-');
    const formattedDate = `${d}/${m}/${y}`;
    const descText = item.description || 'Sem descrição cadastrada';
    const helperText = item.helper ? ` (Ajudante: ${item.helper.name === 'father' ? 'Patrão' : 'Outro'} - R$ ${item.helper.rate})` : '';

    el.innerHTML = `
      <div>
        <div class="day-date-tag">📅 Dia ${formattedDate}</div>
        <div class="day-desc">${descText}</div>
        ${helperText ? `<div class="day-helper-tag">${helperText}</div>` : ''}
      </div>
      <button type="button" class="btn btn-secondary btn-xs edit-day-direct-btn" data-date="${item.date}">
        ✏️ Editar Dia
      </button>
    `;

    el.querySelector('.edit-day-direct-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      closeServiceModal();
      openDayModal(item.date);
    });

    container.appendChild(el);
  });
}

// Renderiza a lista de materiais dentro do modal do serviço
function renderServiceModalMaterialsTab(serviceId) {
  const container = document.getElementById('materials-items-list');
  const countEl = document.getElementById('srv-tab-mat-count');
  const totalEl = document.getElementById('mat-total-amount');

  container.innerHTML = '';

  const srv = appState.services[serviceId];
  if (!srv) return;

  const materials = srv.materials || [];
  countEl.textContent = materials.length;

  let totalCost = 0;

  if (materials.length === 0) {
    container.innerHTML = `<p class="help-text" style="text-align: center; padding: 1rem 0;">Nenhum material registrado ainda nesta obra.</p>`;
    totalEl.textContent = 'R$ 0,00';
    return;
  }

  materials.forEach((mat, index) => {
    totalCost += Number(mat.price) || 0;

    const matEl = document.createElement('div');
    matEl.classList.add('material-item');

    const subInfo = [mat.qty ? `Qtd: ${mat.qty}` : '', mat.store ? `Loja: ${mat.store}` : ''].filter(Boolean).join(' • ');

    matEl.innerHTML = `
      <div class="mat-item-info">
        <span class="mat-item-name">${mat.name || 'Item sem nome'}</span>
        ${subInfo ? `<span class="mat-item-sub">${subInfo}</span>` : ''}
      </div>
      <div class="mat-item-price-col">
        <span class="mat-item-price">${formatCurrency(mat.price)}</span>
        <button type="button" class="mat-del-btn" data-index="${index}" title="Excluir Material">🗑️</button>
      </div>
    `;

    matEl.querySelector('.mat-del-btn').addEventListener('click', () => {
      deleteMaterialFromService(serviceId, index);
    });

    container.appendChild(matEl);
  });

  totalEl.textContent = formatCurrency(totalCost);
}

function addMaterialToService() {
  if (!selectedServiceId || selectedServiceId === 'new') {
    showToast("⚠️ Por favor, salve o serviço primeiro antes de adicionar materiais!");
    return;
  }

  const name = document.getElementById('mat-name').value.trim();
  const qty = document.getElementById('mat-qty').value.trim();
  const price = Number(document.getElementById('mat-price').value);
  const store = document.getElementById('mat-store').value.trim();

  if (!name) {
    showToast("⚠️ Informe o nome ou descrição do material!");
    return;
  }

  const srv = appState.services[selectedServiceId];
  if (!srv) return;

  if (!srv.materials) srv.materials = [];
  srv.materials.push({
    id: `mat_${Date.now()}`,
    name: name,
    qty: qty,
    price: isNaN(price) ? 0 : price,
    store: store,
    date: getLocalDateString(new Date())
  });

  srv.updatedAt = Date.now();
  saveState();

  // Reset inputs
  document.getElementById('mat-name').value = '';
  document.getElementById('mat-qty').value = '';
  document.getElementById('mat-price').value = '';
  document.getElementById('mat-store').value = '';

  showToast("✅ Material adicionado com sucesso!");
  renderServiceModalMaterialsTab(selectedServiceId);
  updateServiceFinancialTab(selectedServiceId);
  renderServices();
}

function deleteMaterialFromService(serviceId, index) {
  const srv = appState.services[serviceId];
  if (srv && srv.materials && srv.materials[index]) {
    srv.materials.splice(index, 1);
    srv.updatedAt = Date.now();
    saveState();
    showToast("🗑️ Material removido.");
    renderServiceModalMaterialsTab(serviceId);
    updateServiceFinancialTab(serviceId);
    renderServices();
  }
}

function updateServiceFinancialTab(serviceId) {
  const srv = appState.services[serviceId];
  if (!srv) return;

  const grossValue = Number(srv.value) || 0;

  // Sum materials
  let materialsCost = 0;
  (srv.materials || []).forEach(m => {
    materialsCost += Number(m.price) || 0;
  });

  // Sum helpers for this service
  let helpersCost = 0;
  Object.keys(appState.events).forEach(dateStr => {
    const ev = appState.events[dateStr];
    if (ev && ev.type !== 'deleted' && ev.serviceId === serviceId && ev.helper) {
      helpersCost += Number(ev.helper.rate) || 0;
    }
  });

  const profit = grossValue - materialsCost - helpersCost;

  document.getElementById('fin-srv-total').textContent = formatCurrency(grossValue);
  document.getElementById('fin-srv-materials').textContent = formatCurrency(materialsCost);
  document.getElementById('fin-srv-helpers').textContent = formatCurrency(helpersCost);
  document.getElementById('fin-srv-profit').textContent = formatCurrency(profit);
}

// Populate service filter dropdowns dynamically based on recorded dates
function updateServiceFilterDropdowns() {
  const monthSelect = document.getElementById('service-filter-month');
  const activeMonthValue = monthSelect.value || 'all';
  
  // Extract unique Year-Month combinations from events
  const monthsSet = new Set();
  Object.keys(appState.events).forEach(dateStr => {
    const event = appState.events[dateStr];
    if (event && event.type !== 'deleted') {
      monthsSet.add(dateStr.substring(0, 7)); // 'YYYY-MM'
    }
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
  const dayRate = Number(appState.settings.dayRate) || 0;
  let calcMethod = appState.settings.calcMethod;
  if (calcMethod === 'deduction') calcMethod = 'offset';
  if (calcMethod === 'accumulation') calcMethod = 'sum_only';
  if (!calcMethod) calcMethod = 'offset';
  
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
      if (event && event.type !== 'deleted') {
        if (event.type === 'father') countFather++;
        if (event.type === 'own') {
          countOwn++;
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
    }
  });

  // Calculate own services sums based on services whose last worked date is in this month
  const serviceDaysMap = {};
  Object.keys(appState.events).forEach(dateStr => {
    const event = appState.events[dateStr];
    if (event && event.type !== 'deleted' && event.serviceId) {
      if (!serviceDaysMap[event.serviceId]) {
        serviceDaysMap[event.serviceId] = [];
      }
      serviceDaysMap[event.serviceId].push(dateStr);
    }
  });

  Object.keys(appState.services).forEach(id => {
    const srv = appState.services[id];
    if (srv.status === 'deleted') return;
    
    const days = serviceDaysMap[id] || [];
    if (days.length === 0) return;
    
    days.sort();
    const lastWorkedDate = days[days.length - 1];
    
    if (lastWorkedDate.startsWith(selectedYM)) {
      const val = Number(srv.value) || 0;
      if (srv.status === 'paid') {
        ownPaidSum += val;
      } else {
        ownPendingSum += val;
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
    if (barOwn) barOwn.style.width = `${(countOwn / totalDaysLogged) * 100}%`;
    if (barFather) barFather.style.width = `${(countFather / totalDaysLogged) * 100}%`;
    if (barOff) barOff.style.width = `${(countOff / totalDaysLogged) * 100}%`;
  } else {
    if (barOwn) barOwn.style.width = '0%';
    if (barFather) barFather.style.width = '0%';
    if (barOff) barOff.style.width = '0%';
  }
  
  const chartLblOwn = document.getElementById('chart-lbl-own');
  const chartLblFather = document.getElementById('chart-lbl-father');
  const chartLblOff = document.getElementById('chart-lbl-off');
  if (chartLblOwn) chartLblOwn.textContent = countOwn;
  if (chartLblFather) chartLblFather.textContent = countFather;
  if (chartLblOff) chartLblOff.textContent = countOff;
  
  // 2. Boss / Father Day Rate and Settlement calculations
  const fullLabel = getFatherLabel();
  const shortName = getFatherShortName();
  const totalFatherEarned = countFather * dayRate;
  
  const repFatherDaysCount = document.getElementById('rep-father-days-count');
  const repFatherDaysTotal = document.getElementById('rep-father-days-total');
  if (repFatherDaysCount) repFatherDaysCount.textContent = countFather;
  if (repFatherDaysTotal) repFatherDaysTotal.textContent = formatCurrency(totalFatherEarned);
  
  const offsetRow = document.getElementById('rep-offset-row');
  const balanceLabel = document.getElementById('rep-father-balance-label');
  const finalAmountEl = document.getElementById('rep-father-final');
  const explanationEl = document.querySelector('.salary-card .calc-explanation');
  
  let netWithFather = totalFatherEarned;
  
  if (calcMethod === 'offset') {
    // Modo compensação mútua: (dias com patrão/pai) - (dias que ele trabalhou pra mim)
    if (offsetRow) {
      offsetRow.style.display = 'flex';
      const offsetDaysCount = document.getElementById('rep-offset-days-count');
      const offsetTotal = document.getElementById('rep-offset-total');
      if (offsetDaysCount) offsetDaysCount.textContent = helperFatherCount;
      if (offsetTotal) offsetTotal.textContent = `- ${formatCurrency(helperFatherTotal)}`;
    }
    
    const diff = totalFatherEarned - helperFatherTotal;
    netWithFather = diff;
    
    if (diff >= 0) {
      if (balanceLabel) balanceLabel.textContent = `A Receber (${shortName}):`;
      if (finalAmountEl) {
        finalAmountEl.textContent = formatCurrency(diff);
        finalAmountEl.className = "amount text-primary";
      }
      if (explanationEl) {
        explanationEl.innerHTML = `Modo Compensação: Trabalhou <strong>${countFather} dias</strong> (${fullLabel}) (+${formatCurrency(totalFatherEarned)}) e ele trabalhou <strong>${helperFatherCount} dias</strong> pra você (-${formatCurrency(helperFatherTotal)}). Saldo a receber: <strong>${formatCurrency(diff)}</strong>.`;
      }
    } else {
      const amountToPay = Math.abs(diff);
      if (balanceLabel) balanceLabel.textContent = `⚠️ Você deve Pagar a(o) ${shortName}:`;
      if (finalAmountEl) {
        finalAmountEl.textContent = formatCurrency(amountToPay);
        finalAmountEl.className = "amount text-danger";
      }
      if (explanationEl) {
        explanationEl.innerHTML = `Modo Compensação: ${shortName} trabalhou mais dias pra você (<strong>${helperFatherCount} dias</strong> = ${formatCurrency(helperFatherTotal)}) do que você com ele (<strong>${countFather} dias</strong> = ${formatCurrency(totalFatherEarned)}). Você deve pagar a ele a diferença de <strong>${formatCurrency(amountToPay)}</strong>.`;
      }
    }
  } else {
    // Modo soma simples de diárias
    if (offsetRow) offsetRow.style.display = 'none';
    if (balanceLabel) balanceLabel.textContent = `Total a Receber (${shortName}):`;
    if (finalAmountEl) {
      finalAmountEl.textContent = formatCurrency(totalFatherEarned);
      finalAmountEl.className = "amount text-primary";
    }
    if (explanationEl) {
      explanationEl.innerHTML = `Modo Soma de Diárias: Multiplica <strong>${countFather} dias</strong> trabalhados (${fullLabel}) pelo valor da diária de <strong>${formatCurrency(dayRate)}</strong>.`;
    }
  }
  
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
  
  // 5. Combined Monthly Consolidation (Diárias + Serviços Pagos - Diárias de todos os Ajudantes)
  const grandTotal = totalFatherEarned + ownPaidSum - helperTotal; // Lucro líquido real recebido
  const grandTotalWithPending = totalFatherEarned + ownTotalSum - helperTotal; // Lucro potencial
  
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
    const event = appState.events[dateStr];
    if (event && event.type !== 'deleted') {
      monthsSet.add(dateStr.substring(0, 7));
    }
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
  const fatherLabelEl = document.getElementById('cfg-father-label');
  const dayRateEl = document.getElementById('cfg-day-rate');
  const helperRateEl = document.getElementById('cfg-helper-rate');
  const calcMethodEl = document.getElementById('cfg-calc-method');
  
  if (fatherLabelEl) fatherLabelEl.value = getFatherLabel();
  if (dayRateEl) dayRateEl.value = appState.settings.dayRate;
  if (helperRateEl) helperRateEl.value = appState.settings.helperRate;
  
  let method = appState.settings.calcMethod;
  if (method === 'deduction') method = 'offset';
  if (method === 'accumulation') method = 'sum_only';
  if (!method) method = 'offset';
  if (calcMethodEl) calcMethodEl.value = method;
  
  // Sheets URL and Sync status
  const sheetsUrlInput = document.getElementById('cfg-sheets-url');
  const syncBtnLabel = document.getElementById('sync-btn-label');
  if (sheetsUrlInput) {
    sheetsUrlInput.value = appState.settings.sheetsUrl || '';
    if (syncBtnLabel) {
      syncBtnLabel.textContent = (appState.settings.sheetsUrl && appState.settings.sheetsUrl.trim()) 
        ? 'Sincronizar Agora' 
        : 'Salvar Link e Conectar Banco';
    }
  }
  
  const lastSyncText = document.getElementById('sync-status-text');
  if (lastSyncText) lastSyncText.textContent = `Última sincronização: ${appState.settings.lastSync || 'Nunca'}`;

  // Versão do app
  const versionLabel = document.getElementById('app-version-label');
  if (versionLabel) versionLabel.textContent = `Versão ${APP_VERSION} (PWA)`;

  applyDynamicLabels();
}

function saveSettingsFromUI() {
  const fatherLabelInput = document.getElementById('cfg-father-label');
  const fatherLabel = fatherLabelInput ? (fatherLabelInput.value.trim() || 'Com o Pai') : 'Com o Pai';
  const dayRate = Number(document.getElementById('cfg-day-rate').value) || 0;
  const helperRate = Number(document.getElementById('cfg-helper-rate').value) || 0;
  const method = document.getElementById('cfg-calc-method').value;
  
  // Sheets URL
  const sheetsUrlInput = document.getElementById('cfg-sheets-url');
  const sheetsUrl = sheetsUrlInput ? sheetsUrlInput.value.trim() : '';
  const urlChanged = (appState.settings.sheetsUrl || '').trim() !== sheetsUrl;
  
  appState.settings.fatherLabel = fatherLabel;
  appState.settings.dayRate = dayRate;
  appState.settings.helperRate = helperRate;
  appState.settings.calcMethod = method;
  appState.settings.sheetsUrl = sheetsUrl;
  
  saveState();
  applyDynamicLabels();
  updateSyncHeaderBtnVisibility();
  showToast("✅ Configurações salvas com sucesso!");
  
  // If user changed sheets URL, trigger sync right away
  if (urlChanged && sheetsUrl) {
    syncWithGoogleSheets(false);
  }
  
  // Refresh views that depend on settings
  if (activeTab === 'tab-reports') renderReports();
  if (activeTab === 'tab-calendar') renderCalendar();
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
  updateSyncHeaderBtnVisibility();
  
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

// --- MAP, WHATSAPP & EXPORT HELPERS ---
function openMapForAddress() {
  const address = document.getElementById('edit-srv-address').value.trim();
  if (!address) {
    showToast("⚠️ Informe um endereço para visualizar no mapa!");
    return;
  }
  const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  window.open(url, '_blank');
}

function openWhatsAppForContact() {
  let phone = document.getElementById('edit-srv-contact').value.replace(/\D/g, '');
  if (!phone) {
    showToast("⚠️ Informe um número de telefone para abrir o WhatsApp!");
    return;
  }
  if (!phone.startsWith('55') && phone.length <= 11) {
    phone = '55' + phone;
  }
  window.open(`https://api.whatsapp.com/send?phone=${phone}`, '_blank');
}

function generateServiceTextSummary(serviceId) {
  const srv = appState.services[serviceId];
  if (!srv) return "";

  const grossValue = Number(srv.value) || 0;
  const receivedValue = Number(srv.valueReceived) || 0;
  const materials = srv.materials || [];

  let totalMaterials = 0;
  materials.forEach(m => totalMaterials += Number(m.price) || 0);

  // Collect days
  const days = [];
  Object.keys(appState.events).forEach(d => {
    const ev = appState.events[d];
    if (ev && ev.type !== 'deleted' && ev.serviceId === serviceId) {
      days.push({ date: d, desc: ev.description || 'Diária realizada' });
    }
  });
  days.sort((a, b) => a.date.localeCompare(b.date));

  let text = `📋 *RESUMO DA OBRA / SERVIÇO*\n`;
  text += `👤 *Cliente/Obra:* ${srv.client || 'N/A'}\n`;
  if (srv.address) text += `📍 *Local:* ${srv.address}\n`;
  text += `-----------------------------------\n`;
  text += `💰 *Valor do Serviço:* ${formatCurrency(grossValue)}\n`;
  if (receivedValue > 0) text += `💵 *Valor Recebido:* ${formatCurrency(receivedValue)}\n`;
  text += `📅 *Dias Trabalhados:* ${days.length} dias\n`;

  if (materials.length > 0) {
    text += `\n🎨 *MATERIAIS USADOS / COMPRADOS (${materials.length} itens):*\n`;
    materials.forEach(m => {
      const qtyStr = m.qty ? ` (${m.qty})` : '';
      text += `- ${m.name}${qtyStr}: ${formatCurrency(m.price)}\n`;
    });
    text += `👉 *Total em Materiais:* ${formatCurrency(totalMaterials)}\n`;
  }

  if (days.length > 0) {
    text += `\n📅 *HISTÓRICO DE DIAS:* \n`;
    days.forEach(d => {
      const [y, m, day] = d.date.split('-');
      text += `• ${day}/${m}/${y}: ${d.desc}\n`;
    });
  }

  return text;
}

function exportWhatsAppSummary() {
  if (!selectedServiceId || selectedServiceId === 'new') return;
  const text = generateServiceTextSummary(selectedServiceId);
  const phone = document.getElementById('edit-srv-contact').value.replace(/\D/g, '');
  let phoneQuery = phone ? `phone=${phone.startsWith('55') ? phone : '55' + phone}&` : '';
  const url = `https://api.whatsapp.com/send?${phoneQuery}text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

function openExportPrintModal() {
  if (!selectedServiceId || selectedServiceId === 'new') return;
  const srv = appState.services[selectedServiceId];
  if (!srv) return;

  const area = document.getElementById('export-print-area');
  const grossValue = Number(srv.value) || 0;
  const receivedValue = Number(srv.valueReceived) || 0;
  const materials = srv.materials || [];

  let totalMaterials = 0;
  materials.forEach(m => totalMaterials += Number(m.price) || 0);

  // Collect days
  const days = [];
  Object.keys(appState.events).forEach(d => {
    const ev = appState.events[d];
    if (ev && ev.type !== 'deleted' && ev.serviceId === selectedServiceId) {
      days.push({ date: d, desc: ev.description || 'Diária realizada' });
    }
  });
  days.sort((a, b) => a.date.localeCompare(b.date));

  let materialsRowsHTML = '';
  if (materials.length > 0) {
    materialsRowsHTML = materials.map(m => `
      <tr>
        <td>${m.name || ''}</td>
        <td>${m.qty || '-'}</td>
        <td>${m.store || '-'}</td>
        <td style="text-align: right; font-weight: bold;">${formatCurrency(m.price)}</td>
      </tr>
    `).join('');
  } else {
    materialsRowsHTML = `<tr><td colspan="4" style="text-align: center; color: #64748b;">Nenhum material cadastrado.</td></tr>`;
  }

  let daysRowsHTML = '';
  if (days.length > 0) {
    daysRowsHTML = days.map(d => {
      const [y, m, day] = d.date.split('-');
      return `
        <tr>
          <td style="width: 110px; font-weight: bold;">${day}/${m}/${y}</td>
          <td>${d.desc}</td>
        </tr>
      `;
    }).join('');
  } else {
    daysRowsHTML = `<tr><td colspan="2" style="text-align: center; color: #64748b;">Nenhum dia registrado.</td></tr>`;
  }

  area.innerHTML = `
    <h2>Relatório de Obra: ${srv.client || 'Sem nome'}</h2>
    <p><strong>Local:</strong> ${srv.address || 'Não informado'} | <strong>Contato:</strong> ${srv.contact || 'Não informado'}</p>
    
    <div style="display: flex; gap: 1.5rem; background: #f8fafc; padding: 0.75rem 1rem; border-radius: 6px; margin: 1rem 0;">
      <div><strong>Valor do Serviço:</strong> ${formatCurrency(grossValue)}</div>
      <div><strong>Já Recebido:</strong> ${formatCurrency(receivedValue)}</div>
      <div><strong>Dias Trabalhados:</strong> ${days.length}</div>
    </div>

    <h3>1. Materiais Usados / Comprados</h3>
    <table>
      <thead>
        <tr>
          <th>Item / Descrição</th>
          <th>Qtd</th>
          <th>Loja / Fornecedor</th>
          <th style="text-align: right;">Valor</th>
        </tr>
      </thead>
      <tbody>
        ${materialsRowsHTML}
      </tbody>
      <tfoot>
        <tr style="background: #f1f5f9;">
          <td colspan="3" style="font-weight: bold; text-align: right;">Total de Materiais:</td>
          <td style="text-align: right; font-weight: bold; color: #00a86b;">${formatCurrency(totalMaterials)}</td>
        </tr>
      </tfoot>
    </table>

    <h3>2. Histórico de Dias Trabalhados</h3>
    <table>
      <thead>
        <tr>
          <th>Data</th>
          <th>Trabalho Realizado no Dia</th>
        </tr>
      </thead>
      <tbody>
        ${daysRowsHTML}
      </tbody>
    </table>
  `;

  document.getElementById('export-modal').classList.add('active');
}

function closeExportPrintModal() {
  document.getElementById('export-modal').classList.remove('active');
}

function copySummaryToClipboard() {
  if (!selectedServiceId || selectedServiceId === 'new') return;
  const text = generateServiceTextSummary(selectedServiceId);
  navigator.clipboard.writeText(text).then(() => {
    showToast("📋 Resumo copiado para a área de transferência!");
  }).catch(() => {
    showToast("⚠️ Erro ao copiar texto.");
  });
}

  // Service Modal Interactions
  document.getElementById('service-modal-close-btn').addEventListener('click', closeServiceModal);
  document.getElementById('service-modal-cancel-btn').addEventListener('click', closeServiceModal);
  
  document.getElementById('service-modal').addEventListener('click', (e) => {
    if (e.target.id === 'service-modal') closeServiceModal();
  });

  // Sub-abas do Modal de Serviço
  const srvNavBtns = document.querySelectorAll('.srv-nav-btn');
  srvNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      switchServiceModalTab(btn.dataset.srvTab);
    });
  });

  // Botões de Ação na Modal de Serviço (Mapa, WhatsApp, Materiais, Exportação)
  document.getElementById('open-map-btn').addEventListener('click', openMapForAddress);
  document.getElementById('open-whatsapp-btn').addEventListener('click', openWhatsAppForContact);
  document.getElementById('add-mat-btn').addEventListener('click', addMaterialToService);
  document.getElementById('export-whatsapp-btn').addEventListener('click', exportWhatsAppSummary);
  document.getElementById('export-print-btn').addEventListener('click', openExportPrintModal);

  // Modal de Exportação / Impressão
  document.getElementById('export-modal-close-btn').addEventListener('click', closeExportPrintModal);
  document.getElementById('export-modal').addEventListener('click', (e) => {
    if (e.target.id === 'export-modal') closeExportPrintModal();
  });
  document.getElementById('print-now-btn').addEventListener('click', () => {
    window.print();
  });
  document.getElementById('copy-summary-btn').addEventListener('click', copySummaryToClipboard);
  
  // Service Modal Save Button Handler
  document.getElementById('service-modal-save-btn').addEventListener('click', () => {
    const client = document.getElementById('edit-srv-client').value.trim();
    const address = document.getElementById('edit-srv-address').value.trim();
    const contact = document.getElementById('edit-srv-contact').value.trim();
    const notes = document.getElementById('edit-srv-description').value.trim();
    const val = Number(document.getElementById('edit-srv-value').value);
    const received = Number(document.getElementById('edit-srv-value-received').value);
    const status = document.getElementById('edit-srv-status').value;

    if (!client) {
      showToast("⚠️ Por favor, informe o nome do cliente ou casa!");
      return;
    }

    if (selectedServiceId === 'new') {
      // Create new service
      const serviceId = `service_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      appState.services[serviceId] = {
        id: serviceId,
        client: client,
        address: address,
        contact: contact,
        notes: notes,
        description: notes, // espelhado por compat de sync
        value: isNaN(val) ? 0 : val,
        valueReceived: isNaN(received) ? 0 : received,
        status: status,
        materials: [],
        updatedAt: Date.now()
      };
      showToast("🎉 Serviço criado com sucesso!");
    } else {
      // Update existing service
      if (appState.services[selectedServiceId]) {
        const s = appState.services[selectedServiceId];
        s.client = client;
        s.address = address;
        s.contact = contact;
        s.notes = notes;
        s.description = notes; // espelhado por compat de sync
        s.value = isNaN(val) ? 0 : val;
        s.valueReceived = isNaN(received) ? 0 : received;
        s.status = status;
        s.updatedAt = Date.now();
        showToast("✏️ Serviço atualizado com sucesso!");
      }
    }
    
    saveState();
    closeServiceModal();
    
    // Refresh active tab views
    if (activeTab === 'tab-calendar') {
      renderCalendar();
    } else if (activeTab === 'tab-services') {
      updateServiceFilterDropdowns();
      renderServices();
    } else if (activeTab === 'tab-reports') {
      renderReports();
    }
  });
  
  // Service Modal Delete Button Handler
  document.getElementById('service-modal-delete-btn').addEventListener('click', () => {
    if (confirm("Deseja realmente excluir este serviço? As diárias vinculadas a ele continuarão registradas, mas perderão o vínculo.")) {
      if (appState.services[selectedServiceId]) {
        appState.services[selectedServiceId].status = 'deleted';
        appState.services[selectedServiceId].updatedAt = Date.now();
        
        // Remove link from events
        Object.keys(appState.events).forEach(dateStr => {
          const ev = appState.events[dateStr];
          if (ev && ev.serviceId === selectedServiceId) {
            ev.serviceId = null;
            ev.updatedAt = Date.now();
          }
        });
        
        saveState();
        closeServiceModal();
        showToast("🗑️ Serviço excluído.");
        
        // Refresh active tab views
        if (activeTab === 'tab-calendar') {
          renderCalendar();
        } else if (activeTab === 'tab-services') {
          updateServiceFilterDropdowns();
          renderServices();
        } else if (activeTab === 'tab-reports') {
          renderReports();
        }
      }
    }
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
  
  // Listen to service select change to show/hide new service fields
  document.getElementById('srv-select').addEventListener('change', (e) => {
    const val = e.target.value;
    const newServiceFields = document.getElementById('new-service-fields');
    if (val === 'new') {
      newServiceFields.style.display = 'block';
    } else {
      newServiceFields.style.display = 'none';
    }
  });
  
  // Modal Save Button Handler
  document.getElementById('modal-save-btn').addEventListener('click', () => {
    const workType = document.querySelector('input[name="modal-work-type"]:checked').value;
    
    // Save service info
    let serviceId = null;
    if (workType === 'own' || workType === 'father') {
      const srvSelectVal = document.getElementById('srv-select').value;
      
      if (srvSelectVal === 'new') {
        const client = document.getElementById('srv-client').value.trim();
        const val = Number(document.getElementById('srv-value').value);
        const status = document.getElementById('srv-status').value;

        if (!client) {
          showToast("⚠️ Por favor, informe o nome do cliente ou casa do novo serviço!");
          return;
        }

        serviceId = `service_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        appState.services[serviceId] = {
          id: serviceId,
          client: client,
          address: '',
          contact: '',
          notes: '',
          description: '',
          value: isNaN(val) ? 0 : val,
          valueReceived: 0,
          status: status,
          updatedAt: Date.now()
        };
      } else if (srvSelectVal !== 'none') {
        serviceId = srvSelectVal;
      }
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

    const dayDescription = document.getElementById('day-description').value.trim();
    
    // Save to State
    appState.events[selectedModalDate] = {
      type: workType,
      serviceId: serviceId,
      helper: helperData,
      description: dayDescription,
      updatedAt: Date.now()
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
      appState.events[selectedModalDate] = {
        type: 'deleted',
        updatedAt: Date.now()
      };
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
  
  // "+ Novo Serviço" button opens modal to create service directly
  document.getElementById('add-service-btn').addEventListener('click', () => {
    openNewServiceModal();
  });
  
  // 8. Reports Month Selector listener
  document.getElementById('report-month-select').addEventListener('change', renderReports);
  
  // 9. Settings actions
  const cfgFatherLabel = document.getElementById('cfg-father-label');
  if (cfgFatherLabel) {
    cfgFatherLabel.addEventListener('input', (e) => {
      appState.settings.fatherLabel = e.target.value.trim() || 'Com o Pai';
      applyDynamicLabels();
    });
  }
  document.getElementById('save-settings-btn').addEventListener('click', saveSettingsFromUI);
  document.getElementById('export-backup-btn').addEventListener('click', exportBackup);
  document.getElementById('import-backup-btn').addEventListener('click', triggerImport);
  document.getElementById('import-file-input').addEventListener('change', handleImportFile);
  document.getElementById('clear-all-data-btn').addEventListener('click', clearAllData);
  
  // Botão "Verificar atualizações"
  const checkUpdatesBtn = document.getElementById('check-updates-btn');
  if (checkUpdatesBtn) {
    checkUpdatesBtn.addEventListener('click', () => {
      showToast("🔄 Procurando atualizações...");
      checkForUpdates(true);
    });
  }

  // Google Sheets Sync Event Listeners
  const syncNowBtn = document.getElementById('sync-now-btn');
  if (syncNowBtn) {
    syncNowBtn.addEventListener('click', () => syncWithGoogleSheets(false));
  }
  const syncHeaderBtn = document.getElementById('sync-header-btn');
  if (syncHeaderBtn) {
    syncHeaderBtn.addEventListener('click', () => syncWithGoogleSheets(false));
  }

  // Detect standalone PWA mode
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  if (isStandalone) {
    document.body.classList.add('standalone');
  }

  // Dynamic feedback when user edits the Google Sheets URL input
  const sheetsUrlInput = document.getElementById('cfg-sheets-url');
  if (sheetsUrlInput) {
    sheetsUrlInput.addEventListener('input', () => {
      const syncBtnLabel = document.getElementById('sync-btn-label');
      const val = sheetsUrlInput.value.trim();
      const current = (appState.settings.sheetsUrl || '').trim();
      if (syncBtnLabel) {
        if (val !== current) {
          syncBtnLabel.textContent = 'Salvar Link e Conectar Banco';
        } else {
          syncBtnLabel.textContent = val ? 'Sincronizar Agora' : 'Salvar Link e Conectar Banco';
        }
      }
    });
  }
});

// --- GOOGLE SHEETS SYNC IMPLEMENTATION ---

// Toggle the sync button in the header based on URL existence
function updateSyncHeaderBtnVisibility() {
  const syncBtn = document.getElementById('sync-header-btn');
  if (syncBtn) {
    if (appState.settings.sheetsUrl && appState.settings.sheetsUrl.trim() !== '') {
      syncBtn.style.display = 'flex';
    } else {
      syncBtn.style.display = 'none';
    }
  }
}

// Merge local and remote events based on updatedAt timestamp
function mergeEvents(localEvents, remoteEvents) {
  const merged = { ...localEvents };
  
  Object.keys(remoteEvents).forEach(dateStr => {
    const localEv = localEvents[dateStr];
    const remoteEv = remoteEvents[dateStr];
    
    if (!localEv) {
      // If doesn't exist locally, add from remote
      merged[dateStr] = remoteEv;
    } else {
      // If exists in both, compare updatedAt
      const localTime = localEv.updatedAt || 0;
      const remoteTime = remoteEv.updatedAt || 0;
      
      if (remoteTime > localTime) {
        merged[dateStr] = remoteEv;
      }
    }
  });
  
  return merged;
}

// Merge local and remote services based on updatedAt timestamp
function mergeServices(localServices, remoteServices) {
  const merged = { ...localServices };
  
  Object.keys(remoteServices).forEach(srvId => {
    const localSrv = localServices[srvId];
    const remoteSrv = remoteServices[srvId];
    
    if (!localSrv) {
      merged[srvId] = remoteSrv;
    } else {
      const localTime = localSrv.updatedAt || 0;
      const remoteTime = remoteSrv.updatedAt || 0;
      
      if (remoteTime > localTime) {
        merged[srvId] = remoteSrv;
      }
    }
  });
  
  return merged;
}

// Function to trigger synchronization with animated button feedback
async function syncWithGoogleSheets(isSilent = false) {
  const sheetsUrlInput = document.getElementById('cfg-sheets-url');
  const bodySyncBtn = document.getElementById('sync-now-btn');
  const syncBtnLabel = document.getElementById('sync-btn-label');
  const feedbackBox = document.getElementById('sync-feedback-box');
  const headerSyncBtn = document.getElementById('sync-header-btn');
  const headerIcon = headerSyncBtn ? headerSyncBtn.querySelector('.sync-icon-svg') : null;

  // 1. Check if user typed a new URL in the input
  let targetUrl = (appState.settings.sheetsUrl || '').trim();
  if (sheetsUrlInput && sheetsUrlInput.value.trim() !== '') {
    targetUrl = sheetsUrlInput.value.trim();
  }

  if (!targetUrl) {
    if (bodySyncBtn) {
      bodySyncBtn.classList.add('error');
      setTimeout(() => bodySyncBtn.classList.remove('error'), 1200);
    }
    triggerHapticFeedback('error');
    if (feedbackBox) {
      feedbackBox.className = 'sync-feedback-card error-state';
      feedbackBox.innerHTML = `
        <div class="feedback-title">⚠️ Link não informado</div>
        <div class="feedback-desc">Cole a URL do Web App gerada no Google Apps Script da sua planilha para conectar o banco de dados.</div>
      `;
      feedbackBox.style.display = 'block';
    }
    if (!isSilent) showToast("⚠️ Cole a URL do Google Sheets!");
    if (sheetsUrlInput) sheetsUrlInput.focus();
    return;
  }

  // Sanity check: URL shape
  if (!targetUrl.includes('script.google.com') || !targetUrl.includes('/exec')) {
    if (feedbackBox) {
      feedbackBox.className = 'sync-feedback-card error-state';
      feedbackBox.innerHTML = `
        <div class="feedback-title">⚠️ Link pode estar incorreto</div>
        <div class="feedback-desc">A URL informada deve ser do Google Apps Script (começar com <code>https://script.google.com/macros/s/.../exec</code>). Não cole o link de edição comum do Google Sheets.</div>
      `;
      feedbackBox.style.display = 'block';
    }
  }

  // Save new URL to state immediately
  if (appState.settings.sheetsUrl !== targetUrl) {
    appState.settings.sheetsUrl = targetUrl;
    window.isSyncingInProgress = true;
    saveState();
    window.isSyncingInProgress = false;
    updateSyncHeaderBtnVisibility();
  }

  // 2. Start Loading Animation on button
  triggerHapticFeedback('medium');
  if (bodySyncBtn) {
    bodySyncBtn.classList.remove('success', 'error');
    bodySyncBtn.classList.add('loading');
    bodySyncBtn.disabled = true;
  }
  if (headerIcon) headerIcon.classList.add('spinning');
  if (!isSilent) showToast("🔄 Conectando ao Google Sheets...");

  try {
    // 3. Fetch data from Google Sheets (GET)
    const response = await fetch(targetUrl, {
      method: 'GET',
      mode: 'cors',
      redirect: 'follow'
    });

    if (!response.ok) throw new Error(`Servidor retornou status ${response.status}`);

    const result = await response.json();
    if (result.status !== 'success') {
      throw new Error(result.message || "Erro retornado pela planilha");
    }

    const remoteEvents = result.events || {};
    const remoteServices = result.services || {};
    const localEvents = appState.events || {};
    const localServices = appState.services || {};

    // 4. Merge data (Lossless timestamp merge)
    const consolidatedEvents = mergeEvents(localEvents, remoteEvents);
    const consolidatedServices = mergeServices(localServices, remoteServices);

    // 5. Save consolidated data back to Google Sheets (POST)
    const postResponse = await fetch(targetUrl, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain'
      },
      body: JSON.stringify({ events: consolidatedEvents, services: consolidatedServices })
    });

    if (!postResponse.ok) throw new Error("Erro ao gravar dados na planilha");
    const postResult = await postResponse.json();
    if (postResult.status !== 'success') {
      throw new Error(postResult.message || "Erro ao salvar na planilha");
    }

    // 6. Update local state
    window.isSyncingInProgress = true;
    appState.events = consolidatedEvents;
    appState.services = consolidatedServices;

    const now = new Date();
    const nowStr = now.toLocaleDateString('pt-BR') + ' às ' + now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    appState.settings.lastSync = nowStr;
    saveState();
    window.isSyncingInProgress = false;

    // Count records
    const eventsCount = Object.keys(consolidatedEvents).filter(k => consolidatedEvents[k].type !== 'deleted').length;
    const servicesCount = Object.keys(consolidatedServices).filter(k => consolidatedServices[k].status !== 'deleted').length;

    // 7. Visual Success Response
    triggerHapticFeedback('success');
    if (bodySyncBtn) {
      bodySyncBtn.classList.remove('loading');
      bodySyncBtn.classList.add('success');
      if (syncBtnLabel) {
        syncBtnLabel.textContent = `✓ Conectado! (${eventsCount} dias, ${servicesCount} obras)`;
      }
    }

    const syncStatusText = document.getElementById('sync-status-text');
    if (syncStatusText) syncStatusText.textContent = `Última sincronização: ${nowStr}`;

    if (feedbackBox) {
      feedbackBox.className = 'sync-feedback-card success-state';
      feedbackBox.innerHTML = `
        <div class="feedback-title">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" style="color: var(--color-brand-green); vertical-align: middle;">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          Link Salvo e Conectado com Sucesso!
        </div>
        <div class="feedback-stats">
          Dados sincronizados: <strong>${eventsCount} dias</strong> e <strong>${servicesCount} obras/serviços</strong> carregados e salvos.
        </div>
      `;
      feedbackBox.style.display = 'block';
    }

    // Refresh views
    if (activeTab === 'tab-calendar') renderCalendar();
    else if (activeTab === 'tab-services') renderServices();
    else if (activeTab === 'tab-reports') renderReports();

    if (!isSilent) showToast(`🎉 Banco conectado! ${eventsCount} dias e ${servicesCount} serviços sincronizados.`);

    // Reset button after 3.5s
    setTimeout(() => {
      if (bodySyncBtn) {
        bodySyncBtn.classList.remove('success');
        if (syncBtnLabel) syncBtnLabel.textContent = 'Sincronizar Agora';
      }
    }, 3500);

  } catch (error) {
    console.error("Erro na sincronização:", error);
    triggerHapticFeedback('error');
    if (bodySyncBtn) {
      bodySyncBtn.classList.remove('loading');
      bodySyncBtn.classList.add('error');
      if (syncBtnLabel) syncBtnLabel.textContent = '✕ Falha ao Conectar';
    }

    if (feedbackBox) {
      feedbackBox.className = 'sync-feedback-card error-state';
      feedbackBox.innerHTML = `
        <div class="feedback-title">❌ Erro ao conectar e carregar dados</div>
        <div class="feedback-desc">${error.message || 'Falha de comunicação com o servidor'}</div>
        <div class="feedback-tip">
          💡 Verifique se o Apps Script da sua planilha foi implantado como <strong>App da Web</strong>, com acesso para <strong>"Qualquer pessoa"</strong> (Anyone) e se a URL termina com <code>/exec</code>.
        </div>
      `;
      feedbackBox.style.display = 'block';
    }

    if (!isSilent) showToast("❌ Erro ao sincronizar: " + error.message);

    setTimeout(() => {
      if (bodySyncBtn) {
        bodySyncBtn.classList.remove('error');
        if (syncBtnLabel) syncBtnLabel.textContent = 'Tentar Conectar Novamente';
      }
    }, 4000);
  } finally {
    if (headerIcon) headerIcon.classList.remove('spinning');
    if (bodySyncBtn) bodySyncBtn.disabled = false;
  }
}

// --- SERVICE WORKER REGISTRATION (PWA) + AUTO-UPDATE ---
let swRegistration = null;
let updateReloading = false;
// Havia um worker controlando a página no carregamento? (evita reload na 1ª instalação)
const hadControllerAtLoad = 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;

function showUpdateBanner() {
  // Evita banners duplicados
  if (document.getElementById('update-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:9999;background:var(--color-brand-green,#00a86b);color:#fff;padding:0.7rem 1.1rem;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,0.3);font-size:0.85rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:0.5rem;max-width:90%;';
  banner.innerHTML = '🔄 Nova versão disponível — toque para atualizar';
  banner.addEventListener('click', () => {
    const waiting = swRegistration && swRegistration.waiting;
    if (waiting) {
      waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  });
  document.body.appendChild(banner);
}

function checkForUpdates(manual = false) {
  if (!swRegistration) {
    if (manual) showToast("⚠️ Atualizações indisponíveis neste navegador.");
    return;
  }
  swRegistration.update()
    .then(() => { if (manual) showToast("✅ Você já está na versão mais recente!"); })
    .catch(() => { if (manual) showToast("❌ Não foi possível verificar agora."); });
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => {
        swRegistration = reg;
        console.log('Service Worker registrado!', reg);

        // Já existe um worker aguardando (nova versão pronta)
        if (reg.waiting && navigator.serviceWorker.controller) {
          showUpdateBanner();
        }

        // Detecta novo worker sendo instalado
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBanner();
            }
          });
        });
      })
      .catch(err => console.warn('Erro ao registrar Service Worker:', err));

    // Verifica atualizações ao voltar para o app
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') checkForUpdates(false);
    });
  });

  // Quando o novo worker assume, recarrega para aplicar a nova versão
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateReloading || !hadControllerAtLoad) return;
    updateReloading = true;
    window.location.reload();
  });
}
