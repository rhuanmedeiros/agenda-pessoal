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
    baseSalary: 3000,
    dayRate: 150,
    helperRate: 120, // default wage for helper/father when working with you
    calcMethod: 'deduction', // 'deduction' | 'accumulation'
    theme: 'dark',
    sheetsUrl: SHEETS_URL,
    lastSync: ''
  }
};

// Versão do app (sincronizada com o CACHE_NAME do sw.js). Suba a cada deploy.
const APP_VERSION = '1.2.0';

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
      if (parsed.services) appState.services = parsed.services;
      if (parsed.settings) appState.settings = { ...appState.settings, ...parsed.settings };
    } catch (e) {
      console.error("Erro ao carregar dados do localStorage:", e);
    }
  }
  
  // Set default helperRate if it doesn't exist (backwards compatibility)
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
  
  Object.keys(appState.events).forEach(dateStr => {
    if (dateStr.startsWith(monthPrefix)) {
      const event = appState.events[dateStr];
      if (event && event.type !== 'deleted') {
        const type = event.type;
        if (type === 'father') countFather++;
        if (type === 'own') countOwn++;
        if (type === 'off') countOff++;
      }
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
    // Default form setup for new entry
    document.querySelector('input[name="modal-work-type"][value="father"]').checked = true;
    toggleServiceFields('father');
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
    const descMatch = srv.description && srv.description.toLowerCase().includes(searchQuery);
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
  
  // Renderizar os cards
  filteredServices.forEach(srv => {
    const card = document.createElement('div');
    card.classList.add('service-item-card');
    
    const valueBRL = formatCurrency(srv.value);
    const statusText = srv.status === 'paid' ? 'Finalizado (Pago)' : 'Pendente (Aberto)';
    const statusClass = srv.status === 'paid' ? 'status-paid' : 'status-pending';
    
    // Formatar dias de trabalho com detalhamento
    let daysHTML = "";
    if (srv.days.length > 0) {
      const listItems = srv.days.map(d => {
        const [year, month, day] = d.split('-');
        const ev = appState.events[d];
        const dayDesc = ev && ev.description ? ` - <span class="day-desc-text" style="color: var(--text-primary);">${ev.description}</span>` : ' (sem descrição do dia)';
        return `<li class="day-bullet-item" data-date="${d}"><strong style="color: var(--color-brand-orange);">Dia ${day}/${month}</strong>${dayDesc}</li>`;
      }).join('');
      
      daysHTML = `
        <div class="service-days-worked" style="font-size: 0.8rem; margin: 0.6rem 0; color: var(--text-secondary);">
          <div style="font-weight: 600; margin-bottom: 0.3rem;">📅 Dias trabalhados (${srv.days.length}) - clique no dia para editar:</div>
          <ul style="margin: 0; padding-left: 0; list-style: none; display: flex; flex-direction: column; gap: 0.2rem;">
            ${listItems}
          </ul>
        </div>
      `;
    } else {
      daysHTML = `<div class="service-days-worked text-warning" style="font-size: 0.8rem; margin: 0.6rem 0;">⚠️ Nenhuma diária vinculada a este serviço ainda.</div>`;
    }
    
    // Linha de detalhes da obra (endereço / contato)
    const srvNotes = srv.notes || srv.description || '';
    const metaParts = [];
    if (srv.address) metaParts.push(`📍 ${srv.address}`);
    if (srv.contact) metaParts.push(`📞 ${srv.contact}`);
    const metaHTML = metaParts.length > 0
      ? `<div class="service-meta" style="margin: 0.4rem 0 0 0; font-size: 0.78rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 0.15rem;">${metaParts.map(p => `<span>${p}</span>`).join('')}</div>`
      : '';

    // Rodapé de valores: mostra recebido/falta quando há adiantamento
    const received = Number(srv.valueReceived) || 0;
    const totalVal = Number(srv.value) || 0;
    let valueBlockHTML;
    if (received > 0) {
      const remaining = Math.max(totalVal - received, 0);
      valueBlockHTML = `
        <div>
          <span class="service-value-lbl" style="font-size: 0.72rem; color: var(--text-secondary); display: block;">Recebido ${formatCurrency(received)} de ${valueBRL}</span>
          <span class="service-value" style="font-size: 1.15rem; font-weight: 700; color: ${remaining > 0 ? 'var(--color-brand-orange)' : 'var(--color-brand-green)'};">${remaining > 0 ? 'Falta ' + formatCurrency(remaining) : 'Quitado ✅'}</span>
        </div>`;
    } else {
      valueBlockHTML = `
        <div>
          <span class="service-value-lbl" style="font-size: 0.72rem; color: var(--text-secondary); display: block;">Valor do Serviço:</span>
          <span class="service-value" style="font-size: 1.15rem; font-weight: 700; color: var(--color-brand-green);">${valueBRL}</span>
        </div>`;
    }

    card.innerHTML = `
      <div class="service-item-header">
        <div class="service-title-container">
          <h4 class="service-client" style="margin: 0; font-size: 1.05rem;">${srv.client || 'Sem nome do cliente'}</h4>
          <span class="service-status-sub" style="font-size: 0.72rem; color: var(--text-secondary);">${statusText}</span>
        </div>
        <span class="status-badge ${statusClass}">${srv.status === 'paid' ? 'Pago' : 'Pendente'}</span>
      </div>
      ${metaHTML}
      ${srvNotes ? `<p class="service-desc" style="margin: 0.5rem 0 0 0; font-size: 0.84rem; line-height: 1.4; color: var(--text-secondary);">${srvNotes}</p>` : ''}
      ${daysHTML}
      <div class="service-footer" style="margin-top: 1rem; display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed var(--border-card); padding-top: 0.8rem;">
        ${valueBlockHTML}
        <div class="service-actions" style="display: flex; gap: 0.4rem;">
          <button class="btn btn-secondary btn-xs edit-srv-btn" data-id="${srv.id}" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; border-radius: 6px; background: rgba(255, 255, 255, 0.05); border: 1px solid var(--border-card); color: var(--text-primary);">
            ✏️ Editar
          </button>
          ${srv.status === 'pending' ? `
            <button class="btn btn-secondary btn-xs finish-srv-btn" data-id="${srv.id}" style="padding: 0.4rem 0.8rem; font-size: 0.75rem; border-radius: 6px; background: rgba(0, 168, 107, 0.1); border: 1px solid var(--color-brand-green); color: var(--color-brand-green);">
              ✅ Finalizar
            </button>
          ` : `
            <button class="btn btn-text text-warning btn-xs reopen-srv-btn" data-id="${srv.id}" style="font-size: 0.75rem; padding: 0.4rem 0.8rem; border-radius: 6px; border: 1px solid var(--color-brand-orange); background: rgba(245, 158, 11, 0.1); color: var(--color-brand-orange);">
              Reabrir
            </button>
          `}
        </div>
      </div>
    `;
    
    // Event handlers para botões
    const editBtn = card.querySelector('.edit-srv-btn');
    if (editBtn) {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openServiceModal(srv.id);
      });
    }

    const finishBtn = card.querySelector('.finish-srv-btn');
    if (finishBtn) {
      finishBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        changeServiceStatus(srv.id, 'paid');
      });
    }
    
    const reopenBtn = card.querySelector('.reopen-srv-btn');
    if (reopenBtn) {
      reopenBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        changeServiceStatus(srv.id, 'pending');
      });
    }
    
    // Configurar cliques nos dias individuais
    const dayItems = card.querySelectorAll('.day-bullet-item');
    dayItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        openDayModal(item.dataset.date);
      });
    });
    
    // Clicar no card abre o dia trabalhado mais recente para edição rápida
    card.addEventListener('click', () => {
      if (srv.days.length > 0) {
        openDayModal(srv.days[srv.days.length - 1]);
      } else {
        openServiceModal(srv.id);
      }
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

function openServiceModal(serviceId) {
  selectedServiceId = serviceId;
  const srv = appState.services[serviceId];
  if (!srv) return;
  
  document.getElementById('service-modal-title').textContent = "Editar Serviço";
  document.getElementById('edit-srv-client').value = srv.client || '';
  document.getElementById('edit-srv-address').value = srv.address || '';
  document.getElementById('edit-srv-contact').value = srv.contact || '';
  document.getElementById('edit-srv-description').value = srv.notes || srv.description || '';
  document.getElementById('edit-srv-value').value = srv.value || '';
  document.getElementById('edit-srv-value-received').value = srv.valueReceived || '';
  document.getElementById('edit-srv-status').value = srv.status || 'pending';

  // Show delete button
  document.getElementById('service-modal-delete-btn').style.display = 'block';
  
  // Open modal
  document.getElementById('service-modal').classList.add('active');
}

function openNewServiceModal() {
  selectedServiceId = 'new';
  
  document.getElementById('service-modal-title').textContent = "Novo Serviço";
  document.getElementById('edit-srv-client').value = '';
  document.getElementById('edit-srv-address').value = '';
  document.getElementById('edit-srv-contact').value = '';
  document.getElementById('edit-srv-description').value = '';
  document.getElementById('edit-srv-value').value = '';
  document.getElementById('edit-srv-value-received').value = '';
  document.getElementById('edit-srv-status').value = 'pending';

  // Hide delete button for new service
  document.getElementById('service-modal-delete-btn').style.display = 'none';
  
  // Open modal
  document.getElementById('service-modal').classList.add('active');
}

function closeServiceModal() {
  document.getElementById('service-modal').classList.remove('active');
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
  document.getElementById('cfg-base-salary').value = appState.settings.baseSalary;
  document.getElementById('cfg-day-rate').value = appState.settings.dayRate;
  document.getElementById('cfg-helper-rate').value = appState.settings.helperRate;
  document.getElementById('cfg-calc-method').value = appState.settings.calcMethod;
  
  // Sheets URL and Sync status
  const sheetsUrlInput = document.getElementById('cfg-sheets-url');
  if (sheetsUrlInput) sheetsUrlInput.value = appState.settings.sheetsUrl || '';
  
  const lastSyncText = document.getElementById('sync-status-text');
  if (lastSyncText) lastSyncText.textContent = `Última sincronização: ${appState.settings.lastSync || 'Nunca'}`;

  // Versão do app
  const versionLabel = document.getElementById('app-version-label');
  if (versionLabel) versionLabel.textContent = `Versão ${APP_VERSION} (PWA)`;
}

function saveSettingsFromUI() {
  const baseSal = Number(document.getElementById('cfg-base-salary').value) || 0;
  const dayRate = Number(document.getElementById('cfg-day-rate').value) || 0;
  const helperRate = Number(document.getElementById('cfg-helper-rate').value) || 0;
  const method = document.getElementById('cfg-calc-method').value;
  
  // Sheets URL
  const sheetsUrlInput = document.getElementById('cfg-sheets-url');
  const sheetsUrl = sheetsUrlInput ? sheetsUrlInput.value.trim() : '';
  
  appState.settings.baseSalary = baseSal;
  appState.settings.dayRate = dayRate;
  appState.settings.helperRate = helperRate;
  appState.settings.calcMethod = method;
  appState.settings.sheetsUrl = sheetsUrl;
  
  saveState();
  updateSyncHeaderBtnVisibility();
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

  // Service Modal Interactions
  document.getElementById('service-modal-close-btn').addEventListener('click', closeServiceModal);
  document.getElementById('service-modal-cancel-btn').addEventListener('click', closeServiceModal);
  
  document.getElementById('service-modal').addEventListener('click', (e) => {
    if (e.target.id === 'service-modal') closeServiceModal();
  });
  
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
  document.getElementById('sync-now-btn').addEventListener('click', syncWithGoogleSheets);
  const syncHeaderBtn = document.getElementById('sync-header-btn');
  if (syncHeaderBtn) {
    syncHeaderBtn.addEventListener('click', syncWithGoogleSheets);
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

// Function to trigger synchronization
async function syncWithGoogleSheets(isSilent = false) {
  // If there is text in the input that hasn't been saved to settings yet, save it first
  const sheetsUrlInput = document.getElementById('cfg-sheets-url');
  if (sheetsUrlInput && sheetsUrlInput.value.trim() !== '') {
    const inputUrl = sheetsUrlInput.value.trim();
    if (appState.settings.sheetsUrl !== inputUrl) {
      appState.settings.sheetsUrl = inputUrl;
      // Temporarily mark syncing to avoid infinite loop when saveState is called
      window.isSyncingInProgress = true;
      saveState();
      window.isSyncingInProgress = false;
      updateSyncHeaderBtnVisibility();
    }
  }

  const sheetsUrl = appState.settings.sheetsUrl;
  if (!sheetsUrl || sheetsUrl.trim() === '') {
    if (!isSilent) showToast("⚠️ URL do Google Sheets não configurada!");
    return;
  }
  
  // Visual feedback: Spin icons
  const headerSyncBtn = document.getElementById('sync-header-btn');
  const bodySyncBtn = document.getElementById('sync-now-btn');
  const headerIcon = headerSyncBtn ? headerSyncBtn.querySelector('.sync-icon-svg') : null;
  const bodyIcon = bodySyncBtn ? bodySyncBtn.querySelector('.inline-svg') : null;
  
  if (headerIcon) headerIcon.classList.add('spinning');
  if (bodyIcon) bodyIcon.classList.add('spinning');
  if (bodySyncBtn) bodySyncBtn.disabled = true;
  
  if (!isSilent) showToast("🔄 Sincronizando com a Nuvem...");
  
  try {
    // 1. Fetch data from Google Sheets (GET)
    const response = await fetch(sheetsUrl, {
      method: 'GET',
      mode: 'cors',
      redirect: 'follow'
    });
    
    if (!response.ok) throw new Error("Erro na requisição GET");
    
    const result = await response.json();
    if (result.status !== 'success') {
      throw new Error(result.message || "Erro retornado pela API");
    }
    
    const remoteEvents = result.events || {};
    const remoteServices = result.services || {};
    const localEvents = appState.events;
    const localServices = appState.services;
    
    // 2. Check if local is empty and remote has data (First synchronization on new device)
    const hasLocalData = (Object.keys(localEvents).filter(k => localEvents[k].type !== 'deleted').length > 0) ||
                         (Object.keys(localServices).filter(k => localServices[k].status !== 'deleted').length > 0);
                         
    const hasRemoteData = (Object.keys(remoteEvents).filter(k => remoteEvents[k].type !== 'deleted').length > 0) ||
                          (Object.keys(remoteServices).filter(k => remoteServices[k].status !== 'deleted').length > 0);
    
    let consolidatedEvents = {};
    let consolidatedServices = {};
    if (!hasLocalData && hasRemoteData) {
      if (isSilent) {
        consolidatedEvents = remoteEvents;
        consolidatedServices = remoteServices;
      } else {
        // Ask user if they want to pull remote data
        if (confirm("Detectamos dados na sua planilha online, mas este celular está sem registros. Deseja baixar os dados da nuvem para este celular?")) {
          consolidatedEvents = remoteEvents;
          consolidatedServices = remoteServices;
          showToast("📥 Dados baixados do Google Sheets!");
        } else {
          // User chose to overwrite remote with empty local
          consolidatedEvents = localEvents;
          consolidatedServices = localServices;
        }
      }
    } else {
      // Ordinary merge based on timestamps
      consolidatedEvents = mergeEvents(localEvents, remoteEvents);
      consolidatedServices = mergeServices(localServices, remoteServices);
    }
    
    // 3. Send consolidated data back to Google Sheets (POST)
    const postResponse = await fetch(sheetsUrl, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain' // simple content-type to avoid CORS preflight options block
      },
      body: JSON.stringify({ events: consolidatedEvents, services: consolidatedServices })
    });
    
    if (!postResponse.ok) throw new Error("Erro na requisição POST");
    
    const postResult = await postResponse.json();
    if (postResult.status !== 'success') {
      throw new Error(postResult.message || "Erro ao salvar na planilha");
    }
    
    // 4. Update local state
    window.isSyncingInProgress = true;
    appState.events = consolidatedEvents;
    appState.services = consolidatedServices;
    
    const nowStr = new Date().toLocaleString('pt-BR');
    appState.settings.lastSync = nowStr;
    saveState();
    window.isSyncingInProgress = false;
    
    // 5. Update UI
    const syncStatusText = document.getElementById('sync-status-text');
    if (syncStatusText) syncStatusText.textContent = `Última sincronização: ${nowStr}`;
    
    // Refresh views
    if (activeTab === 'tab-calendar') renderCalendar();
    else if (activeTab === 'tab-services') renderServices();
    else if (activeTab === 'tab-reports') renderReports();
    
    if (!isSilent) showToast("☁️ Sincronizado com sucesso!");
    
  } catch (error) {
    console.error("Erro na sincronização:", error);
    if (!isSilent) showToast("❌ Erro ao sincronizar: " + error.message);
  } finally {
    // Stop spinning icons
    if (headerIcon) headerIcon.classList.remove('spinning');
    if (bodyIcon) bodyIcon.classList.remove('spinning');
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
