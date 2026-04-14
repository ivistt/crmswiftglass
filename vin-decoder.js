// ========== VIN DECODER + AUTOCOMPLETE + CALCULATOR FORM LOGIC ==========

// ── Розширена локальна база популярних авто (особливо євро-марки) ──
const LOCAL_MAKES_MODELS = {
    // Японські
    'Toyota':   ['Auris','Avalon','Avensis','Aventis','Aygo','C-HR','Camry','Corolla','Corolla Cross','FJ Cruiser','GR86','GT86','Highlander','Hilux','Land Cruiser','Land Cruiser Prado','Prius','Proace','RAV4','Rush','Sequoia','Sienna','Supra','Tacoma','Tundra','Urban Cruiser','Venza','Verso','Vios','Wish','Yaris','Yaris Cross','4Runner'],
    'Honda':    ['Accord','City','Civic','CR-V','CR-Z','Element','Fit','FR-V','HR-V','Insight','Jazz','Legend','Odyssey','Passport','Pilot','Prelude','Ridgeline','S2000','Shuttle','Stream','ZR-V'],
    'Nissan':   ['370Z','Altima','Armada','Ariya','Cube','Frontier','GT-R','Juke','Kicks','Leaf','Maxima','Micra','Murano','Navara','Note','Pathfinder','Patrol','Pixo','Pulsar','Qashqai','Rogue','Sentra','Sylphy','Tiida','Titan','Versa','X-Trail','Xterra'],
    'Mazda':    ['2','3','5','6','323','626','CX-3','CX-30','CX-5','CX-7','CX-8','CX-9','CX-60','CX-90','MX-5','MX-30','RX-8','Tribute'],
    'Mitsubishi':['ASX','Carisma','Colt','Eclipse','Eclipse Cross','Galant','Grandis','L200','Lancer','Lancer Evolution','Montero','Outlander','Pajero','Pajero Sport','Space Star'],
    'Subaru':   ['BRZ','Crosstrek','Forester','Impreza','Legacy','Levorg','Outback','Solterra','Tribeca','WRX','XV'],
    'Suzuki':   ['Alto','Baleno','Celerio','Dzire','Ertiga','Grand Vitara','Ignis','Jimny','Kizashi','Liana','S-Cross','Splash','Swift','SX4','Vitara','Wagon R','XL7'],
    'Lexus':    ['CT','ES','GS','GX','IS','LC','LS','LX','NX','RC','RX','UX'],
    'Infiniti': ['EX','FX','G','M','Q30','Q50','Q60','Q70','QX30','QX50','QX56','QX60','QX70','QX80'],
    'Acura':    ['CL','ILX','MDX','NSX','RDX','RLX','TL','TLX','TSX'],
    // Корейські
    'Hyundai':  ['Accent','Azera','Bayon','Creta','Elantra','Getz','i10','i20','i30','i40','i45','Ioniq','Ioniq 5','Ioniq 6','Kona','Matrix','Nexo','Palisade','Santa Cruz','Santa Fe','Solaris','Sonata','Staria','Terracan','Trajet','Tucson','Veloster','Venue','Veracruz'],
    'Kia':      ['Ceed','Cerato','Carnival','EV6','EV9','Forte','K5','K8','K9','Mohave','Niro','Optima','Picanto','ProCeed','Rio','Seltos','Sorento','Soul','Sportage','Stinger','Stonic','Telluride','Venga','XCeed'],
    // Китайські
    'Chery':    ['Amulet','Arrizo 3','Arrizo 5','Arrizo 7','Arrizo 8','Exeed LX','Exeed TXL','Fulwin','QQ','Tiggo','Tiggo 4','Tiggo 7','Tiggo 8'],
    'Geely':    ['Azkarra','Atlas','Coolray','Emgrand','GX3','MX11','Monjaro','Tugella'],
    'BYD':      ['Atto 3','Dolphin','Han','Sea','Seal','Song','Tang'],
    'Haval':    ['Dargo','F7','F7x','H1','H2','H4','H6','H9','Jolion','M6'],
    'Changan':  ['CS15','CS35','CS55','CS75','CS85','CS95','CX70'],
    // Американські
    'Ford':     ['Bronco','Bronco Sport','C-Max','Edge','Escape','EcoSport','Expedition','Explorer','F-150','F-250','F-350','Fiesta','Flex','Focus','Fusion','Galaxy','Kuga','Maverick','Mondeo','Mustang','Puma','Ranger','S-Max','Taurus','Transit','Transit Connect','Transit Custom'],
    'Chevrolet':['Blazer','Bolt','Camaro','Colorado','Corvette','Cruze','Equinox','Express','Impala','Malibu','Silverado','Sonic','Spark','Suburban','Tahoe','Trailblazer','Traverse','Trax'],
    'Jeep':     ['Cherokee','Commander','Compass','Gladiator','Grand Cherokee','Grand Wagoneer','Patriot','Renegade','Wrangler'],
    'Dodge':    ['Challenger','Charger','Dart','Durango','Journey','Ram','Viper'],
    'RAM':      ['1500','2500','3500','ProMaster'],
    'GMC':      ['Acadia','Canyon','Envoy','Sierra','Terrain','Yukon'],
    'Buick':    ['Enclave','Encore','Envision','LaCrosse'],
    'Cadillac': ['CT4','CT5','Escalade','Lyriq','XT4','XT5','XT6'],
    'Lincoln':  ['Aviator','Corsair','Nautilus','Navigator'],
    'Tesla':    ['Cybertruck','Model 3','Model S','Model X','Model Y','Roadster'],
    // Європейські
    'Volkswagen':['Amarok','Arteon','Atlas','Beetle','Bora','Caddy','California','Caravelle','CC','CrossPolo','Fox','Golf','Golf Plus','Golf Sportsvan','ID.3','ID.4','ID.5','ID.6','ID.7','Jetta','Lupo','Multivan','Phaeton','Polo','Scirocco','Sharan','T-Cross','T-Roc','Tiguan','Tiguan Allspace','Touareg','Touran','Transporter','Up'],
    'BMW':       ['i3','i4','i5','i7','i8','iX','iX3','M2','M3','M4','M5','M6','M8','X1','X2','X3','X4','X5','X6','X7','XM','Z3','Z4','1 Series','2 Series','3 Series','4 Series','5 Series','6 Series','7 Series','8 Series'],
    'Mercedes-Benz':['A-Class','B-Class','C-Class','CLA','CLK','CLS','E-Class','G-Class','GLA','GLB','GLC','GLE','GLK','GLS','ML-Class','S-Class','SL','SLC','SLK','Sprinter','V-Class','Viano','Vito','EQA','EQB','EQC','EQE','EQS'],
    'Audi':      ['A1','A2','A3','A4','A5','A6','A7','A8','e-tron','e-tron GT','Q2','Q3','Q4 e-tron','Q5','Q6 e-tron','Q7','Q8','R8','RS3','RS4','RS5','RS6','RS7','S3','S4','S5','S6','S7','S8','SQ5','SQ7','SQ8','TT','TTS'],
    'Renault':   ['Arkana','Austral','Captur','Clio','Duster','Espace','Express','Fluence','Kadjar','Kangoo','Koleos','Laguna','Latitude','Logan','Master','Megane','Modus','Scenic','Stepway','Symbol','Trafic','Triber','Twingo','Vel Satis','Zoe'],
    'Peugeot':   ['107','108','2008','207','208','3008','301','307','308','408','5008','508','607','e-208','e-2008','Expert','Partner','Rifter','Traveller'],
    'Citroën':   ['Berlingo','C1','C2','C3','C3 Aircross','C3 Picasso','C4','C4 Cactus','C4 Picasso','C5','C5 Aircross','C5 X','C6','C8','DS3','DS4','DS5','Grand Picasso','Jumper','Jumpy','Nemo','Xsara'],
    'Opel':      ['Adam','Agila','Ampera','Antara','Astra','Cascada','Combo','Corsa','Crossland','Frontera','Grandland','Insignia','Meriva','Mokka','Omega','Signum','Tigra','Vectra','Vivaro','Zafira','Zafira Tourer'],
    'Skoda':     ['Citigo','Enyaq','Fabia','Kamiq','Karoq','Kodiaq','Octavia','Rapid','Roomster','Scala','Superb','Yeti'],
    'SEAT':      ['Altea','Arona','Arosa','Ateca','Cordoba','El-Born','Exeo','Ibiza','Leon','Mii','Tarraco','Toledo'],
    'Cupra':     ['Ateca','Born','Formentor','Leon'],
    'Fiat':      ['124 Spider','500','500C','500L','500X','Bravo','Doblo','Ducato','Fiorino','Freemont','Grande Punto','Idea','Panda','Punto','Qubo','Sedici','Stilo','Tipo','Ulysse'],
    'Alfa Romeo':['147','156','159','166','Brera','Giulia','Giulietta','GTV','MiTo','Spider','Stelvio','Tonale'],
    'Lancia':    ['Delta','Musa','Phedra','Thesis','Ypsilon'],
    'Maserati':  ['Ghibli','GranTurismo','Grecale','Levante','MC20','Quattroporte'],
    'Ferrari':   ['296','488','812','California','F8','GTC4Lusso','LaFerrari','Portofino','Roma','SF90'],
    'Lamborghini':['Aventador','Huracán','Urus'],
    'Porsche':   ['718 Boxster','718 Cayman','911','Cayenne','Macan','Panamera','Taycan'],
    'Volvo':     ['C30','C40','C70','S40','S60','S80','S90','V40','V50','V60','V70','V90','XC40','XC60','XC70','XC90'],
    'Saab':      ['9-3','9-5'],
    'Land Rover':['Defender','Discovery','Discovery Sport','Freelander','Range Rover','Range Rover Evoque','Range Rover Sport','Range Rover Velar'],
    'Jaguar':    ['E-Pace','F-Pace','F-Type','I-Pace','S-Type','X-Type','XE','XF','XJ'],
    'MINI':      ['Clubman','Convertible','Cooper','Countryman','Coupe','Paceman','Roadster'],
    'Rolls-Royce':['Cullinan','Ghost','Phantom','Spectre','Wraith'],
    'Bentley':   ['Bentayga','Continental','Flying Spur','Mulsanne'],
    'Aston Martin':['DB11','DB12','DBX','Rapide','Vantage'],
    'McLaren':   ['570S','600LT','720S','Artura','GT'],
    'Dacia':     ['Duster','Jogger','Logan','Lodgy','Sandero','Spring'],
    'DS Automobiles':['DS 3','DS 4','DS 5','DS 7','DS 9'],
    'Lada':      ['Granta','Kalina','Largus','Niva','Priora','Vesta','XRAY'],
    'Škoda':     ['Citigo','Enyaq','Fabia','Kamiq','Karoq','Kodiaq','Octavia','Rapid','Scala','Superb','Yeti'],
    'Zastava':   ['10','101','128'],
    // Мікроавтобуси / комерційні
    'Volkswagen Commercial':['Caddy','Crafter','Multivan','Transporter'],
    'Mercedes-Benz Vans':   ['Citan','Metris','Sprinter','Viano','Vito'],
};

// Нормалізуємо ключі для пошуку без урахування регістру
const LOCAL_MAKES_LOWER = {};
for (const [make, models] of Object.entries(LOCAL_MAKES_MODELS)) {
    LOCAL_MAKES_LOWER[make.toLowerCase()] = { make, models };
}
const ALL_LOCAL_MAKES = Object.keys(LOCAL_MAKES_MODELS).sort((a, b) => a.localeCompare(b));

const nhtsaCache = {
    makes: null,
    models: {}
};

// Об'єднуємо NHTSA-марки з локальними (видаляємо дублікати)
// Спочатку повертаємо локальні одразу, NHTSA підвантажуємо у фоні
async function loadAllMakes() {
    if (nhtsaCache.makes) return nhtsaCache.makes;

    // Одразу повертаємо локальні марки — без очікування NHTSA
    nhtsaCache.makes = ALL_LOCAL_MAKES;

    // Фонове збагачення NHTSA (не блокуємо UI)
    (async () => {
        try {
            const res  = await fetch('https://vpic.nhtsa.dot.gov/api/vehicles/GetAllMakes?format=json');
            const data = await res.json();
            const nhtsa = data.Results.map(r => r.Make_Name);
            const seen = new Set(nhtsaCache.makes.map(m => m.toLowerCase()));
            const extra = nhtsa.filter(m => !seen.has(m.toLowerCase()));
            if (extra.length > 0) {
                nhtsaCache.makes = [...nhtsaCache.makes, ...extra].sort((a, b) => a.localeCompare(b));
            }
        } catch { /* мережева помилка — залишаємо локальні */ }
    })();

    return nhtsaCache.makes;
}

// Завантажуємо моделі: спочатку локальні одразу, NHTSA у фоні
async function loadModels(make) {
    const key = make.toLowerCase();
    if (nhtsaCache.models[key]) return nhtsaCache.models[key];

    const localEntry = LOCAL_MAKES_LOWER[key];
    const localModels = localEntry ? localEntry.models.slice() : [];

    // Одразу повертаємо локальні
    nhtsaCache.models[key] = localModels.length > 0
        ? localModels.sort((a, b) => a.localeCompare(b))
        : [];

    // Фонове збагачення NHTSA
    ;(async () => {
        try {
            const res  = await fetch('https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMake/' + encodeURIComponent(make) + '?format=json');
            const data = await res.json();
            const nhtsaModels = data.Results.map(r => r.Model_Name);
            const seen = new Set(nhtsaCache.models[key].map(m => m.toLowerCase()));
            const extra = nhtsaModels.filter(m => !seen.has(m.toLowerCase()));
            if (extra.length > 0) {
                nhtsaCache.models[key] = [...nhtsaCache.models[key], ...extra].sort((a, b) => a.localeCompare(b));
            }
        } catch { /* продовжуємо без NHTSA */ }
    })();

    return nhtsaCache.models[key];
}

// Фільтрація: спочатку startsWith, потім підрядок
function filterList(list, query) {
    if (!query) return list.slice(0, 80);
    const q = query.toLowerCase();
    const starts = list.filter(i => i.toLowerCase().startsWith(q));
    const contains = list.filter(i => !i.toLowerCase().startsWith(q) && i.toLowerCase().includes(q));
    return [...starts, ...contains].slice(0, 60);
}

// ── Ініціалізація autocomplete на input ──────────────────────
function initAutocomplete(inputId, getItems, onSelect) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const wrapper = input.parentElement;
    wrapper.style.position = 'relative';

    const dropdown = document.createElement('ul');
    dropdown.className = 'ac-dropdown';
    dropdown.setAttribute('role', 'listbox');
    wrapper.appendChild(dropdown);

    let activeIdx = -1;
    let isOpen    = false;
    let allItems  = [];

    function openDropdown(items) {
        allItems = items;
        renderDropdown(filterList(items, input.value));
    }

    function renderDropdown(items) {
        activeIdx = -1;
        dropdown.innerHTML = '';
        if (items.length === 0) {
            dropdown.innerHTML = '<li class="ac-empty">Нічого не знайдено</li>';
        } else {
            items.forEach((item, i) => {
                const li = document.createElement('li');
                li.className = 'ac-item';
                li.setAttribute('role', 'option');
                li.setAttribute('data-idx', i);
                const q = input.value.toLowerCase();
                if (q && item.toLowerCase().startsWith(q)) {
                    li.innerHTML = `<b>${item.slice(0, q.length)}</b>${item.slice(q.length)}`;
                } else {
                    li.textContent = item;
                }
                li.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    selectItem(item);
                });
                dropdown.appendChild(li);
            });
        }
        dropdown.classList.add('open');
        isOpen = true;
    }

    function selectItem(value) {
        input.value = value;
        closeDropdown();
        if (onSelect) onSelect(value);
    }

    function closeDropdown() {
        dropdown.classList.remove('open');
        dropdown.innerHTML = '';
        isOpen  = false;
        activeIdx = -1;
    }

    function highlightItem(idx) {
        const items = dropdown.querySelectorAll('.ac-item');
        items.forEach(li => li.classList.remove('ac-active'));
        if (items[idx]) {
            items[idx].classList.add('ac-active');
            items[idx].scrollIntoView({ block: 'nearest' });
        }
    }

    input.addEventListener('focus', async () => {
        const items = await getItems(input.value);
        allItems = items;
        renderDropdown(filterList(items, input.value));
    });

    input.addEventListener('input', async () => {
        if (allItems.length === 0) {
            allItems = await getItems(input.value);
        }
        if (!isOpen && allItems.length) {
            dropdown.classList.add('open');
            isOpen = true;
        }
        renderDropdown(filterList(allItems, input.value));
    });

    input.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.ac-item');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeIdx = Math.min(activeIdx + 1, items.length - 1);
            highlightItem(activeIdx);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeIdx = Math.max(activeIdx - 1, 0);
            highlightItem(activeIdx);
        } else if (e.key === 'Enter' && activeIdx >= 0) {
            e.preventDefault();
            const active = dropdown.querySelector('.ac-active');
            if (active) selectItem(active.textContent);
        } else if (e.key === 'Escape') {
            closeDropdown();
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(closeDropdown, 150);
    });
}

// ── Типи кузова (фіксований список) ─────────────────────────
const BODY_TYPES = [
    'Седан', 'Хетчбек', 'Універсал', 'Позашляховик / SUV',
    'Кросовер', 'Купе', 'Кабріолет', 'Мінівен',
    'Пікап', 'Фургон', 'Мікроавтобус', 'Лімузин'
];

// Маппінг сирих значень NHTSA → наш список
const BODY_TYPE_MAP = {
    'sedan':        'Седан',
    'hatchback':    'Хетчбек',
    'wagon':        'Універсал',
    'station wagon':'Універсал',
    'suv':          'Позашляховик / SUV',
    'sport utility':'Позашляховик / SUV',
    'multipurpose': 'Позашляховик / SUV',
    'crossover':    'Кросовер',
    'coupe':        'Купе',
    'convertible':  'Кабріолет',
    'cabriolet':    'Кабріолет',
    'minivan':      'Мінівен',
    'van':          'Мінівен',
    'pickup':       'Пікап',
    'truck':        'Пікап',
    'cargo':        'Фургон',
    'bus':          'Мікроавтобус',
    'limousine':    'Лімузин',
    'passenger car':'Седан',
};

// Декодування року з 10-ї позиції VIN (стандарт ISO 3779)
function decodeYearFromVin(char) {
    const map2 = {
        'A':2010,'B':2011,'C':2012,'D':2013,'E':2014,'F':2015,'G':2016,'H':2017,
        'J':2018,'K':2019,'L':2020,'M':2021,'N':2022,'P':2023,'R':2024,'S':2025,'T':2026,
        '1':2001,'2':2002,'3':2003,'4':2004,'5':2005,'6':2006,'7':2007,'8':2008,'9':2009,
        'Y':2000,
    };
    const year = map2[char.toUpperCase()];
    return year ? String(year) : '';
}

function mapBodyType(raw) {
    if (!raw) return '';
    const lower = raw.toLowerCase();
    for (const [key, val] of Object.entries(BODY_TYPE_MAP)) {
        if (lower.includes(key)) return val;
    }
    return '';
}

// ── VIN декодер ──────────────────────────────────────────────
let vinDecodeTimer = null;

function initVinDecoder() {
    const vinInput = document.getElementById('cVin');
    if (!vinInput) return;

    vinInput.addEventListener('input', () => {
        const vin = vinInput.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        vinInput.value = vin;

        clearTimeout(vinDecodeTimer);
        clearVinStatus();

        if (vin.length === 17) {
            setVinStatus('loading');
            vinDecodeTimer = setTimeout(() => decodeVin(vin), 500);
        }
    });
}

function isBlank(v) {
    return !v || v === 'Not Applicable' || v === 'null' || v === '0';
}

// ── Декодування через NHTSA ──────────────────────────────────
async function decodeVinNHTSA(vin) {
    const res  = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${vin}?format=json`);
    const data = await res.json();
    if (!data.Results) return null;

    const get = (varName, varId) => {
        let r = data.Results.find(r => r.Variable === varName);
        if ((!r || isBlank(r.Value)) && varId)
            r = data.Results.find(r => r.VariableId === varId);
        return (r && !isBlank(r.Value)) ? r.Value.trim() : '';
    };

    return {
        make:  get('Make', 26),
        model: get('Model', 28),
        year:  get('Model Year', 29),
        body:  get('Body Class', 5) || get('Vehicle Type', 39),
    };
}

async function decodeVin(vin) {
    try {
        const n = await decodeVinNHTSA(vin).catch(() => null) || {};

        let make  = n.make  || '';
        let model = n.model || '';
        let year  = n.year  || '';
        let body  = n.body  || '';

        if (!year && vin.length === 17) {
            year = decodeYearFromVin(vin[9]);
        }

        const bodyMapped = mapBodyType(body);
        const filled = [];

        if (make)       { setFieldAutofilled('cMake',  make);        filled.push('марку'); }
        if (model)      { setFieldAutofilled('cModel', model);       filled.push('модель'); }
        if (year)       { setFieldAutofilled('cYear',  year);        filled.push('рік'); }
        if (bodyMapped) { setFieldAutofilled('cBody',  bodyMapped);  filled.push('кузов'); }

        if (filled.length > 0) {
            setVinStatus('success', `Визначено: ${filled.join(', ')}`);
        } else {
            setVinStatus('error', 'Дані не знайдено — заповніть вручну');
        }

    } catch (err) {
        console.error('VIN decode error:', err);
        setVinStatus('error', 'Помилка запиту');
    }
}

function setFieldAutofilled(id, value) {
    const input = document.getElementById(id);
    if (!input) return;
    input.value = value;
    input.classList.add('autofilled');
    setTimeout(() => input.classList.remove('autofilled'), 3000);
}

function setVinStatus(type, msg) {
    let el = document.getElementById('vinStatus');
    if (!el) {
        el = document.createElement('div');
        el.id = 'vinStatus';
        el.className = 'vin-status';
        const vinInput = document.getElementById('cVin');
        if (vinInput) vinInput.parentElement.appendChild(el);
    }

    el.className = 'vin-status';
    if (type === 'loading') {
        el.classList.add('vin-loading');
        el.innerHTML = '<span class="vin-spinner"></span> Декодуємо VIN...';
    } else if (type === 'success') {
        el.classList.add('vin-ok');
        el.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> ${msg}`;
    } else if (type === 'error') {
        el.classList.add('vin-err');
        el.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> ${msg || 'Не вдалося декодувати'}`;
    }
}

function clearVinStatus() {
    const el = document.getElementById('vinStatus');
    if (el) el.remove();
    ['cMake','cModel','cYear','cBody'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('autofilled');
    });
}

// ── Ініціалізуємо після DOMContentLoaded ────────────────────
document.addEventListener('DOMContentLoaded', function() {
    initAutocomplete(
        'cMake',
        async () => loadAllMakes(),
        (selectedMake) => {
            const modelInput = document.getElementById('cModel');
            if (modelInput) modelInput.value = '';
        }
    );

    initAutocomplete(
        'cModel',
        async () => {
            const make = document.getElementById('cMake').value.trim();
            if (!make) return [];
            return loadModels(make);
        },
        null
    );

    initAutocomplete(
        'cBody',
        async () => BODY_TYPES,
        null
    );

    initVinDecoder();
});
