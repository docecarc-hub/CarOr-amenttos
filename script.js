
// --- SISTEMA DE NOTIFICAÇÃO TOAST (SUGESTÃO 4) ---
function mostrarToast(mensagem, tipo = 'sucesso') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px;';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    const corBg = tipo === 'erro' ? '#ef4444' : (tipo === 'aviso' ? '#f59e0b' : '#10b981');
    toast.style.cssText = `background: ${corBg}; color: white; padding: 12px 20px; border-radius: 8px; font-weight: 600; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); transition: all 0.3s ease; opacity: 0; transform: translateY(10px);`;
    toast.innerText = mensagem;
    
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; }, 10);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

const firebaseConfig = {
  apiKey: "AIzaSyDycrR-zIKobchwKGrXZ2_g-_fgDLTfYe4",
  authDomain: "carorcamentos.firebaseapp.com",
  projectId: "carorcamentos",
  storageBucket: "carorcamentos.firebasestorage.app",
  messagingSenderId: "183749190610",
  appId: "1:183749190610:web:431eca7b24e7f3bab71e0b",
  measurementId: "G-X6PM3EBJTC"
};

let fbAuth = null, fbDb = null, _timerNuvem = null, sistemaIniciado = false;
if (firebaseConfig.apiKey !== "COLE_AQUI" && window.firebase) {
    firebase.initializeApp(firebaseConfig);
    fbAuth = firebase.auth();
    fbDb = firebase.firestore();
}

function bytesParaBase64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
}
function base64ParaBytes(b64) {
    const s = atob(b64), u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
}
function docNuvem() {
    return fbDb.collection('oficinas').doc(fbAuth.currentUser.uid);
}
async function carregarBancoDaNuvem() {
    const snap = await docNuvem().get();
    return snap.exists ? base64ParaBytes(snap.data().banco) : null;
}
function enviarBancoParaNuvem() {
    if (!fbDb || !fbAuth.currentUser || !db) return;
    clearTimeout(_timerNuvem);
    _timerNuvem = setTimeout(async () => {
        try {
            const b64 = bytesParaBase64(db.export());
            if (b64.length > 900000) mostrarToast('Banco perto do limite de 1 MB do Firestore!', 'aviso');
            await docNuvem().set({ banco: b64, atualizadoEm: firebase.firestore.FieldValue.serverTimestamp() });
        } catch (e) {
            console.error('Erro ao salvar na nuvem:', e);
            mostrarToast('Falha ao sincronizar com a nuvem.', 'erro');
        }
    }, 1500);
}

function mostrarLogin() {
    if (document.getElementById('overlay-login')) return;
    const o = document.createElement('div');
    o.id = 'overlay-login';
    o.style.cssText = 'position:fixed;inset:0;background:#f1f5f9;z-index:10000;display:flex;align-items:center;justify-content:center;font-family:inherit;';
    o.innerHTML = `<div style="background:#fff;padding:32px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.1);width:320px;display:flex;flex-direction:column;gap:12px;">
        <h2 style="margin:0;text-align:center;">🛠️ Entrar</h2>
        <input id="login-email" type="email" placeholder="E-mail" style="padding:10px;border:1px solid #cbd5e1;border-radius:8px;">
        <input id="login-senha" type="password" placeholder="Senha" style="padding:10px;border:1px solid #cbd5e1;border-radius:8px;">
        <button id="login-btn" style="padding:10px;background:#2563eb;color:#fff;border:0;border-radius:8px;font-weight:600;cursor:pointer;">Entrar</button>
        <small id="login-erro" style="color:#ef4444;min-height:16px;"></small></div>`;
    document.body.appendChild(o);
    const entrar = async () => {
        try {
            await fbAuth.signInWithEmailAndPassword(
                document.getElementById('login-email').value.trim(),
                document.getElementById('login-senha').value);
        } catch (e) { document.getElementById('login-erro').innerText = 'E-mail ou senha inválidos.'; }
    };
    document.getElementById('login-btn').onclick = entrar;
    document.getElementById('login-senha').onkeydown = ev => { if (ev.key === 'Enter') entrar(); };
}
function fecharLogin() {
    const o = document.getElementById('overlay-login');
    if (o) o.remove();
    const badge = document.querySelector('.status-badge');
    if (badge) badge.innerHTML = '<i class="fa-solid fa-circle"></i> Nuvem Firebase <a href="#" onclick="fbAuth.signOut().then(()=>location.reload());return false;" style="margin-left:8px;color:inherit;text-decoration:underline;">Sair</a>';
}

let db = null;
let ultimoOrcamentoTexto = "";
let ultimaRespostaIA = "";

async function inicializarBancoSQL() {
    try {
        const SQL = await initSqlJs({
            locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
        });

        let bytesBanco = null;
        if (fbDb && fbAuth.currentUser) bytesBanco = await carregarBancoDaNuvem();
        if (!bytesBanco) {
            // Sem dados na nuvem: usa os dados locais (primeira migração) e eles sobem ao salvar
            const savedDb = localStorage.getItem('oficina_sqlite_db');
            if (savedDb) bytesBanco = new Uint8Array(JSON.parse(savedDb));
        }
        if (bytesBanco) {
            db = new SQL.Database(bytesBanco);
            garantirColunasNasTabelas();
            console.log("Banco SQLite carregado com sucesso!");
        } else {
            db = new SQL.Database();
            criarTabelasSQL();
            popularDadosIniciaisSQL();
            salvarBancoNoLocalStorage();
            console.log("Novo banco SQLite criado e populado!");
        }
        carregarConfiguracoesNaTela();
    } catch (err) {
        console.error("Erro ao inicializar o SQLite:", err);
    }
}

function criarTabelasSQL() {
    db.run(`
        CREATE TABLE IF NOT EXISTS orcamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente TEXT,
            veiculo TEXT,
            servico TEXT,
            valor REAL,
            data TEXT
        );

        CREATE TABLE IF NOT EXISTS oleos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            preco_litro REAL NOT NULL,
            tipo TEXT CHECK(tipo IN ('motor', 'cambio')) NOT NULL
        );

        CREATE TABLE IF NOT EXISTS arruelas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            preco REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS filtros_estoque (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            codigo TEXT UNIQUE NOT NULL,
            aplicacao TEXT NOT NULL,
            categoria TEXT DEFAULT 'Filtro de Óleo',
            preco REAL DEFAULT 35.00
        );

        CREATE TABLE IF NOT EXISTS veiculos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            modelo TEXT UNIQUE NOT NULL,
            litros_motor REAL NOT NULL,
            litros_cambio_aut REAL,
            litros_cambio_man REAL,
            oleo_motor_id INTEGER,
            arruela_id INTEGER,
            filtro_oleo_id INTEGER,
            filtro_ar_id INTEGER,
            filtro_comb_id INTEGER,
            filtro_cabine_id INTEGER
        );
    `);
}

function garantirColunasNasTabelas() {
    try { db.run("ALTER TABLE veiculos ADD COLUMN litros_cambio_aut REAL;"); } catch (e) {}
    try { db.run("ALTER TABLE veiculos ADD COLUMN litros_cambio_man REAL;"); } catch (e) {}
    try { db.run("ALTER TABLE veiculos ADD COLUMN oleo_motor_id INTEGER;"); } catch (e) {}
    try { db.run("ALTER TABLE veiculos ADD COLUMN arruela_id INTEGER;"); } catch (e) {}
    try { db.run("ALTER TABLE filtros_estoque ADD COLUMN categoria TEXT DEFAULT 'Filtro de Óleo';"); } catch (e) {}
    try { db.run("ALTER TABLE filtros_estoque ADD COLUMN preco REAL DEFAULT 35.00;"); } catch (e) {}
    try { db.run("ALTER TABLE veiculos ADD COLUMN filtro_oleo_id INTEGER;"); } catch (e) {}
    try { db.run("ALTER TABLE veiculos ADD COLUMN filtro_ar_id INTEGER;"); } catch (e) {}
    try { db.run("ALTER TABLE veiculos ADD COLUMN filtro_comb_id INTEGER;"); } catch (e) {}
    try { db.run("ALTER TABLE veiculos ADD COLUMN filtro_cabine_id INTEGER;"); } catch (e) {}
    salvarBancoNoLocalStorage();
}

function popularDadosIniciaisSQL() {
    db.run("INSERT INTO oleos (nome, preco_litro, tipo) VALUES ('Motul 8100 5W40', 45.00, 'motor');");
    db.run("INSERT INTO oleos (nome, preco_litro, tipo) VALUES ('Total Quartz 7000 15W40', 48.00, 'motor');");
    db.run("INSERT INTO oleos (nome, preco_litro, tipo) VALUES ('Motul ATF Transmissão', 85.00, 'cambio');");
    db.run("INSERT INTO arruelas (nome, preco) VALUES ('Arruela de Vedação', 6.00);");
    
    db.run("INSERT OR IGNORE INTO filtros_estoque (codigo, aplicacao, categoria, preco) VALUES ('C1941', 'CELTA', 'Filtro de Óleo', 35.00);");
    db.run("INSERT OR IGNORE INTO filtros_estoque (codigo, aplicacao, categoria, preco) VALUES ('C24005', 'COROLLA', 'Filtro de Ar do Motor', 45.00);");
    db.run("INSERT OR IGNORE INTO filtros_estoque (codigo, aplicacao, categoria, preco) VALUES ('WO150', 'FORD / HONDA', 'Filtro de Óleo', 38.00);");
    db.run("INSERT OR IGNORE INTO filtros_estoque (codigo, aplicacao, categoria, preco) VALUES ('WUNI0005', 'FIAT / CHERY', 'Filtro de Combustível', 40.00);");

    db.run("INSERT OR IGNORE INTO veiculos (modelo, litros_motor, litros_cambio_aut, litros_cambio_man, oleo_motor_id, arruela_id, filtro_oleo_id) VALUES ('Chery Tiggo 2', 3.0, 6.0, 2.0, 1, 1, 1);");
    db.run("INSERT OR IGNORE INTO veiculos (modelo, litros_motor, litros_cambio_aut, litros_cambio_man, oleo_motor_id, arruela_id, filtro_oleo_id) VALUES ('Honda Civic LXL 1.8 (2011)', 3.7, 6.0, 1.6, 2, 1, 3);");
}

function salvarBancoNoLocalStorage() {
    const data = db.export();
    localStorage.setItem('oficina_sqlite_db', JSON.stringify(Array.from(data)));
    enviarBancoParaNuvem();
}

function trocarAba(aba) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    const tabMap = {
        'orcamento': { id: 'aba-orcamento', idx: 0 },
        'historico': { id: 'aba-historico', idx: 1 },
        'filtros': { id: 'aba-filtros', idx: 2 },
        'cadastro': { id: 'aba-cadastro', idx: 3 },
        'gerenciar': { id: 'aba-gerenciar', idx: 4 },
        'config': { id: 'aba-config', idx: 5 },
        'ia': { id: 'aba-ia', idx: 6 }
    };

    const target = tabMap[aba];
    if (target) {
        const targetTab = document.getElementById(target.id);
        const navItems = document.querySelectorAll('.nav-item');
        
        if (targetTab) targetTab.classList.add('active');
        if (navItems[target.idx]) navItems[target.idx].classList.add('active');

        // Executar inicializações específicas por aba
        if (aba === 'orcamento') {
            carregarSelectVeiculosSQL();
            carregarSelectsOleosSQL();
            carregarSelectArruelasOrcamento();
            carregarSelectsFiltrosOrcamento();
        } else if (aba === 'cadastro') {
            carregarSelectsFiltrosCadastroCarro();
            carregarSelectsOleosCadastroCarro();
            carregarSelectArruelasCadastroCarro();
        } else if (aba === 'gerenciar') {
            renderizarTabelaGerenciamentoVeiculos();
            renderizarTabelaGerenciamentoOleos();
            renderizarTabelaGerenciamentoArruelas();
        } else if (aba === 'filtros') {
            renderizarTabelaFiltrosSQL("");
        } else if (aba === 'historico') {
            renderizarHistoricoOrcamentos();
        } else if (aba === 'config') {
            carregarConfiguracoesNaTela();
        }
    }
}

function trocarSubAba(subId) {
    document.querySelectorAll('.sub-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('#aba-cadastro .sub-nav-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(subId).style.display = 'block';
    event.currentTarget.classList.add('active');
    if (subId === 'sub-carro') {
        carregarSelectsFiltrosCadastroCarro();
        carregarSelectsOleosCadastroCarro();
        carregarSelectArruelasCadastroCarro();
    }
}

function trocarSubAbaGerenciar(subId) {
    document.querySelectorAll('.sub-tab-content-ger').forEach(el => el.style.display = 'none');
    document.querySelectorAll('#aba-gerenciar .sub-nav-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(subId).style.display = 'block';
    event.currentTarget.classList.add('active');
}

// --- CONFIGURAÇÕES & SINCRONIZAÇÃO EM TEMPO REAL ---
function salvarConfiguracoes() {
    const nome = document.getElementById('cfg_nome_oficina').value;
    const endereco = document.getElementById('cfg_endereco').value;
    const rodape = document.getElementById('cfg_rodape').value;

    localStorage.setItem('cfg_nome_oficina', nome);
    localStorage.setItem('cfg_endereco', endereco);
    localStorage.setItem('cfg_rodape', rodape);

    atualizarTituloTopoSite();
    mostrarToast("Configurações salvas e sincronizadas com sucesso!");
}

function carregarConfiguracoesNaTela() {
    const nome = localStorage.getItem('cfg_nome_oficina');
    const endereco = localStorage.getItem('cfg_endereco');
    const rodape = localStorage.getItem('cfg_rodape');

    if (nome && document.getElementById('cfg_nome_oficina')) document.getElementById('cfg_nome_oficina').value = nome;
    if (endereco && document.getElementById('cfg_endereco')) document.getElementById('cfg_endereco').value = endereco;
    if (rodape && document.getElementById('cfg_rodape')) document.getElementById('cfg_rodape').value = rodape;

    atualizarTituloTopoSite();
}

function atualizarTituloTopoSite() {
    const nomeOficina = localStorage.getItem('cfg_nome_oficina') || 'Car Doce Car';
    const elementoTitulo = document.getElementById('titulo_topo_oficina');
    if (elementoTitulo) {
        elementoTitulo.innerHTML = `🛠️ ${nomeOficina} - Gestão de Oficina & Estoque`;
    }
}

function exportarBackupBanco() {
    const savedDb = localStorage.getItem('oficina_sqlite_db');
    if (!savedDb) { mostrarToast("Nenhum banco encontrado."); return; }
    
    const blob = new Blob([savedDb], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_stoqcar_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
}

async function limparBancoDados() {
    if (confirm("Tem certeza que deseja apagar todos os dados e resetar o sistema?")) {
        localStorage.removeItem('oficina_sqlite_db');
        clearTimeout(_timerNuvem);
        if (fbDb && fbAuth.currentUser) { try { await docNuvem().delete(); } catch (e) { console.error(e); } }
        location.reload();
    }
}

function carregarSelectVeiculosSQL() {
    if (!db) return;
    const res = db.exec("SELECT id, modelo FROM veiculos ORDER BY modelo ASC;");
    const select = document.getElementById('veiculo');
    if (!select) return;

    select.innerHTML = '<option value="">Selecione um carro...</option>';
    if (!res.length || !res[0].values.length) return;

    res[0].values.forEach(row => {
        let opt = document.createElement('option');
        opt.value = row[0];
        opt.textContent = row[1];
        select.appendChild(opt);
    });
}

function carregarSelectsOleosSQL() {
    if (!db) return;
    const resMotor = db.exec("SELECT id, nome, preco_litro FROM oleos WHERE tipo = 'motor' ORDER BY preco_litro ASC;");
    const selectMotor = document.getElementById('select_oleo_motor');
    if (selectMotor && resMotor.length && resMotor[0].values.length) {
        selectMotor.innerHTML = '';
        resMotor[0].values.forEach(row => {
            let opt = document.createElement('option');
            opt.value = row[2];
            opt.dataset.id = row[0];
            opt.textContent = `${row[1]} (R$ ${row[2].toFixed(2)}/L)`;
            selectMotor.appendChild(opt);
        });
        aoSelecionarOleoMotor();
    }

    const resCambio = db.exec("SELECT id, nome, preco_litro FROM oleos WHERE tipo = 'cambio' ORDER BY preco_litro ASC;");
    const selectCambio = document.getElementById('select_oleo_cambio');
    if (selectCambio && resCambio.length && resCambio[0].values.length) {
        selectCambio.innerHTML = '';
        resCambio[0].values.forEach(row => {
            let opt = document.createElement('option');
            opt.value = row[2];
            opt.dataset.id = row[0];
            opt.textContent = `${row[1]} (R$ ${row[2].toFixed(2)}/L)`;
            selectCambio.appendChild(opt);
        });
        aoSelecionarOleoCambio();
    }
}

function carregarSelectArruelasOrcamento() {
    if (!db) return;
    const sel = document.getElementById('select_arruela');
    if (!sel) return;
    sel.innerHTML = '<option value="">Nenhuma</option>';
    const res = db.exec("SELECT id, nome, preco FROM arruelas ORDER BY preco ASC;");
    if (res.length && res[0].values.length) {
        res[0].values.forEach(a => {
            let opt = document.createElement('option');
            opt.value = a[0];
            opt.dataset.preco = a[2];
            opt.textContent = `${a[1]} - R$ ${a[2].toFixed(2)}`;
            sel.appendChild(opt);
        });
    }
}

function carregarSelectsOleosCadastroCarro() {
    if (!db) return;
    const sel = document.getElementById('cad_oleo_motor_id');
    if (!sel) return;
    sel.innerHTML = '<option value="">Nenhum</option>';
    const res = db.exec("SELECT id, nome, preco_litro FROM oleos WHERE tipo = 'motor' ORDER BY preco_litro ASC;");
    if (res.length && res[0].values.length) {
        res[0].values.forEach(o => {
            let opt = document.createElement('option');
            opt.value = o[0];
            opt.textContent = `${o[1]} (R$ ${o[2].toFixed(2)}/L)`;
            sel.appendChild(opt);
        });
    }
}

function carregarSelectArruelasCadastroCarro() {
    if (!db) return;
    const sel = document.getElementById('cad_arruela_id');
    if (!sel) return;
    sel.innerHTML = '<option value="">Nenhuma</option>';
    const res = db.exec("SELECT id, nome, preco FROM arruelas ORDER BY preco ASC;");
    if (res.length && res[0].values.length) {
        res[0].values.forEach(a => {
            let opt = document.createElement('option');
            opt.value = a[0];
            opt.textContent = `${a[1]} (R$ ${a[2].toFixed(2)})`;
            sel.appendChild(opt);
        });
    }
}

function carregarSelectsFiltrosOrcamento() {
    if (!db) return;
    
    const categorias = [
        { cat: 'Filtro de Óleo', elem: 'select_filtro_oleo' },
        { cat: 'Filtro de Ar do Motor', elem: 'select_filtro_ar' },
        { cat: 'Filtro de Combustível', elem: 'select_filtro_combustivel' },
        { cat: 'Filtro de Ar-Condicionado (Cabine)', elem: 'select_filtro_cabine' }
    ];

    categorias.forEach(c => {
        const sel = document.getElementById(c.elem);
        if (!sel) return;
        sel.innerHTML = '<option value="">Nenhum / Não incluir</option>';
        const res = db.exec(`SELECT id, codigo, aplicacao, preco FROM filtros_estoque WHERE categoria = '${c.cat}' ORDER BY preco ASC;`);
        if (res.length && res[0].values.length) {
            res[0].values.forEach(f => {
                let opt = document.createElement('option');
                opt.value = f[0];
                opt.dataset.preco = f[3];
                opt.textContent = `${f[1]} - ${f[2]} - R$ ${f[3].toFixed(2)}`;
                sel.appendChild(opt);
            });
        }
    });
}

function carregarSelectsFiltrosCadastroCarro() {
    if (!db) return;

    const preencherSelectFiltro = (elementId, categoriaDesejada, selecionarMaisEmConta = false) => {
        const sel = document.getElementById(elementId);
        if (!sel) return;
        sel.innerHTML = '<option value="">Nenhum</option>';
        const res = db.exec(`SELECT id, codigo, aplicacao, preco FROM filtros_estoque WHERE categoria = '${categoriaDesejada}' ORDER BY preco ASC;`);
        if (res.length && res[0].values.length) {
            res[0].values.forEach((f, index) => {
                let opt = document.createElement('option');
                opt.value = f[0];
                opt.textContent = `${f[1]} - ${f[2]} (R$ ${f[3].toFixed(2)})`;
                if (selecionarMaisEmConta && index === 0) opt.selected = true;
                sel.appendChild(opt);
            });
        }
    };

    preencherSelectFiltro('cad_filtro_oleo_id', 'Filtro de Óleo', true);
    preencherSelectFiltro('cad_filtro_ar_id', 'Filtro de Ar do Motor', false);
    preencherSelectFiltro('cad_filtro_comb_id', 'Filtro de Combustível', false);
    preencherSelectFiltro('cad_filtro_cab_id', 'Filtro de Ar-Condicionado (Cabine)', false);
}

function aoSelecionarOleoMotor() {
    const select = document.getElementById('select_oleo_motor');
    if (select && select.value) {
        document.getElementById('preco_litro_motor').value = parseFloat(select.value).toFixed(2);
    }
}

function aoSelecionarOleoCambio() {
    const select = document.getElementById('select_oleo_cambio');
    if (select && select.value) {
        document.getElementById('preco_litro_cambio').value = parseFloat(select.value).toFixed(2);
    }
}

function aoSelecionarVeiculo() {
    const idVeiculo = document.getElementById('veiculo').value;
    if (!idVeiculo) return;
    
    const res = db.exec(`SELECT litros_motor, oleo_motor_id, arruela_id, filtro_oleo_id, filtro_ar_id, filtro_comb_id, filtro_cabine_id FROM veiculos WHERE id = ${idVeiculo};`);
    if (res.length && res[0].values.length) {
        const v = res[0].values[0];
        document.getElementById('info_litros_motor').innerText = `${v[0]}L`;
        
        if (v[1]) {
            const selOleo = document.getElementById('select_oleo_motor');
            for (let i = 0; i < selOleo.options.length; i++) {
                if (selOleo.options[i].dataset.id == v[1]) {
                    selOleo.selectedIndex = i;
                    aoSelecionarOleoMotor();
                    break;
                }
            }
        }

        if (v[2]) document.getElementById('select_arruela').value = v[2];
        if (v[3]) document.getElementById('select_filtro_oleo').value = v[3];
        if (v[4]) document.getElementById('select_filtro_ar').value = v[4];
        if (v[5]) document.getElementById('select_filtro_combustivel').value = v[5];
        if (v[6]) document.getElementById('select_filtro_cabine').value = v[6];
    }
    atualizarLitrosCambio();
}

function atualizarLitrosCambio() {
    const idVeiculo = document.getElementById('veiculo').value;
    if (!idVeiculo) return;
    const tipo = document.getElementById('tipo_cambio_select').value;
    const coluna = tipo === 'automatico' ? 'litros_cambio_aut' : 'litros_cambio_man';
    const res = db.exec(`SELECT ${coluna} FROM veiculos WHERE id = ${idVeiculo};`);
    if (res.length && res[0].values.length) {
        document.getElementById('info_litros_cambio').innerText = `${res[0].values[0][0] || 0}L`;
    }
}

function toggleServico(tipo) {
    if (tipo === 'motor') {
        const ativo = document.getElementById('chk_servico_motor').checked;
        document.getElementById('box_motor').style.display = ativo ? 'block' : 'none';
    } else if (tipo === 'cambio') {
        const ativo = document.getElementById('chk_servico_cambio').checked;
        document.getElementById('box_cambio').style.display = ativo ? 'block' : 'none';
    }
}

// --- CRUD DE VEÍCULOS ---
function salvarNovoVeiculo(event) {
    event.preventDefault();
    const id = document.getElementById('edit_veiculo_id').value;
    const modelo = document.getElementById('cad_modelo').value.trim();
    const litrosMotor = parseFloat(document.getElementById('cad_litros_motor').value) || 3.0;
    const litrosAut = parseFloat(document.getElementById('cad_litros_aut').value) || 6.0;
    const litrosMan = parseFloat(document.getElementById('cad_litros_man').value) || 2.0;
    
    const oleoMotorId = document.getElementById('cad_oleo_motor_id').value || null;
    const arruelaId = document.getElementById('cad_arruela_id').value || null;
    const fOleo = document.getElementById('cad_filtro_oleo_id').value || null;
    const fAr = document.getElementById('cad_filtro_ar_id').value || null;
    const fComb = document.getElementById('cad_filtro_comb_id').value || null;
    const fCabine = document.getElementById('cad_filtro_cab_id').value || null;

    if (id) {
        db.run("UPDATE veiculos SET modelo = ?, litros_motor = ?, litros_cambio_aut = ?, litros_cambio_man = ?, oleo_motor_id = ?, arruela_id = ?, filtro_oleo_id = ?, filtro_ar_id = ?, filtro_comb_id = ?, filtro_cabine_id = ? WHERE id = ?;", 
            [modelo, litrosMotor, litrosAut, litrosMan, oleoMotorId, arruelaId, fOleo, fAr, fComb, fCabine, id]);
        mostrarToast("Veículo atualizado com sucesso!");
    } else {
        db.run("INSERT OR REPLACE INTO veiculos (modelo, litros_motor, litros_cambio_aut, litros_cambio_man, oleo_motor_id, arruela_id, filtro_oleo_id, filtro_ar_id, filtro_comb_id, filtro_cabine_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);", 
            [modelo, litrosMotor, litrosAut, litrosMan, oleoMotorId, arruelaId, fOleo, fAr, fComb, fCabine]);
        mostrarToast("Veículo cadastrado com sucesso!");
    }
    document.getElementById('formNovoCarro').reset();
    document.getElementById('edit_veiculo_id').value = "";
    document.getElementById('btnSalvarCarro').innerText = "Salvar Veículo";
    salvarBancoNoLocalStorage();
    carregarSelectVeiculosSQL();
    trocarAba('gerenciar');
    trocarSubAbaGerenciar('ger-carro');
}

function editarVeiculo(id) {
    const res = db.exec(`SELECT id, modelo, litros_motor, litros_cambio_aut, litros_cambio_man, oleo_motor_id, arruela_id, filtro_oleo_id, filtro_ar_id, filtro_comb_id, filtro_cabine_id FROM veiculos WHERE id = ${id};`);
    if (!res.length || !res[0].values.length) return;
    const v = res[0].values[0];

    document.getElementById('edit_veiculo_id').value = v[0];
    document.getElementById('cad_modelo').value = v[1];
    document.getElementById('cad_litros_motor').value = v[2];
    document.getElementById('cad_litros_aut').value = v[3] || 6.0;
    document.getElementById('cad_litros_man').value = v[4] || 2.0;

    trocarAba('cadastro');
    carregarSelectsFiltrosCadastroCarro();
    carregarSelectsOleosCadastroCarro();
    carregarSelectArruelasCadastroCarro();

    if (v[5]) document.getElementById('cad_oleo_motor_id').value = v[5];
    if (v[6]) document.getElementById('cad_arruela_id').value = v[6];
    if (v[7]) document.getElementById('cad_filtro_oleo_id').value = v[7];
    if (v[8]) document.getElementById('cad_filtro_ar_id').value = v[8];
    if (v[9]) document.getElementById('cad_filtro_comb_id').value = v[9];
    if (v[10]) document.getElementById('cad_filtro_cab_id').value = v[10];

    document.getElementById('btnSalvarCarro').innerText = "Atualizar Veículo";
    document.getElementById('tituloFormCarro').innerText = `Editar Veículo: ${v[1]}`;

    document.querySelectorAll('.sub-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('#aba-cadastro .sub-nav-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('sub-carro').style.display = 'block';
    document.querySelectorAll('#aba-cadastro .sub-nav-btn')[0].classList.add('active');
}

function excluirVeiculo(id) {
    if (confirm("Deseja realmente excluir este veículo?")) {
        db.run("DELETE FROM veiculos WHERE id = ?;", [id]);
        salvarBancoNoLocalStorage();
        renderizarTabelaGerenciamentoVeiculos();
        carregarSelectVeiculosSQL();
    }
}

// --- CRUD DE ÓLEOS ---
function salvarNovoOleo(event) {
    event.preventDefault();
    const id = document.getElementById('edit_oleo_id').value;
    const nome = document.getElementById('novo_oleo_nome').value.trim();
    const preco = parseFloat(document.getElementById('novo_oleo_preco').value) || 0;
    const tipo = document.getElementById('novo_oleo_tipo').value;

    if (id) {
        db.run("UPDATE oleos SET nome = ?, preco_litro = ?, tipo = ? WHERE id = ?;", [nome, preco, tipo, id]);
        mostrarToast("Óleo atualizado com sucesso!");
    } else {
        db.run("INSERT INTO oleos (nome, preco_litro, tipo) VALUES (?, ?, ?);", [nome, preco, tipo]);
        mostrarToast("Óleo cadastrado com sucesso!");
    }
    document.getElementById('formNovoOleo').reset();
    document.getElementById('edit_oleo_id').value = "";
    document.getElementById('btnSalvarOleo').innerText = "Cadastrar Óleo";
    salvarBancoNoLocalStorage();
    carregarSelectsOleosSQL();
    trocarAba('gerenciar');
    trocarSubAbaGerenciar('ger-oleo');
}

function editarOleo(id) {
    const res = db.exec(`SELECT id, nome, preco_litro, tipo FROM oleos WHERE id = ${id};`);
    if (!res.length || !res[0].values.length) return;
    const o = res[0].values[0];

    document.getElementById('edit_oleo_id').value = o[0];
    document.getElementById('novo_oleo_nome').value = o[1];
    document.getElementById('novo_oleo_preco').value = o[2];
    document.getElementById('novo_oleo_tipo').value = o[3];

    document.getElementById('btnSalvarOleo').innerText = "Atualizar Óleo";
    document.getElementById('tituloFormOleo').innerText = `Editar Óleo: ${o[1]}`;

    trocarAba('cadastro');
    document.querySelectorAll('.sub-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('#aba-cadastro .sub-nav-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('sub-oleo').style.display = 'block';
    document.querySelectorAll('#aba-cadastro .sub-nav-btn')[1].classList.add('active');
}

function excluirOleo(id) {
    if (confirm("Deseja realmente excluir este óleo?")) {
        db.run("DELETE FROM oleos WHERE id = ?;", [id]);
        salvarBancoNoLocalStorage();
        renderizarTabelaGerenciamentoOleos();
        carregarSelectsOleosSQL();
    }
}

// --- CRUD DE ARRUELAS ---
function salvarNovaArruela(event) {
    event.preventDefault();
    const id = document.getElementById('edit_arruela_id').value;
    const nome = document.getElementById('nova_arruela_nome').value.trim();
    const preco = parseFloat(document.getElementById('nova_arruela_preco').value) || 0;

    if (id) {
        db.run("UPDATE arruelas SET nome = ?, preco = ? WHERE id = ?;", [nome, preco, id]);
        mostrarToast("Arruela atualizada com sucesso!");
    } else {
        db.run("INSERT INTO arruelas (nome, preco) VALUES (?, ?);", [nome, preco]);
        mostrarToast("Arruela cadastrada com sucesso!");
    }
    document.getElementById('formNovaArruela').reset();
    document.getElementById('edit_arruela_id').value = "";
    document.getElementById('btnSalvarArruela').innerText = "Cadastrar Arruela";
    salvarBancoNoLocalStorage();
    trocarAba('gerenciar');
    trocarSubAbaGerenciar('ger-arruela');
}

function editarArruela(id) {
    const res = db.exec(`SELECT id, nome, preco FROM arruelas WHERE id = ${id};`);
    if (!res.length || !res[0].values.length) return;
    const a = res[0].values[0];

    document.getElementById('edit_arruela_id').value = a[0];
    document.getElementById('nova_arruela_nome').value = a[1];
    document.getElementById('nova_arruela_preco').value = a[2];

    document.getElementById('btnSalvarArruela').innerText = "Atualizar Arruela";
    document.getElementById('tituloFormArruela').innerText = `Editar Arruela: ${a[1]}`;

    trocarAba('cadastro');
    document.querySelectorAll('.sub-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('#aba-cadastro .sub-nav-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('sub-arruela').style.display = 'block';
    document.querySelectorAll('#aba-cadastro .sub-nav-btn')[3].classList.add('active');
}

function excluirArruela(id) {
    if (confirm("Deseja realmente excluir esta arruela?")) {
        db.run("DELETE FROM arruelas WHERE id = ?;", [id]);
        salvarBancoNoLocalStorage();
        renderizarTabelaGerenciamentoArruelas();
    }
}

// --- CRUD DE FILTROS ---
function salvarNovoFiltro(event) {
    event.preventDefault();
    const id = document.getElementById('edit_filtro_id').value;
    const codigo = document.getElementById('cad_f_codigo').value.trim().toUpperCase();
    const aplicacao = document.getElementById('cad_f_aplicacao').value.trim();
    const categoria = document.getElementById('cad_f_categoria').value;
    const preco = parseFloat(document.getElementById('cad_f_preco').value) || 35.00;

    try {
        if (id) {
            db.run("UPDATE filtros_estoque SET codigo = ?, aplicacao = ?, categoria = ?, preco = ? WHERE id = ?;", [codigo, aplicacao, categoria, preco, id]);
            mostrarToast("Filtro atualizado com sucesso!");
        } else {
            db.run("INSERT OR REPLACE INTO filtros_estoque (codigo, aplicacao, categoria, preco) VALUES (?, ?, ?, ?);", [codigo, aplicacao, categoria, preco]);
            mostrarToast("Filtro cadastrado com sucesso!");
        }
        document.getElementById('formNovoFiltro').reset();
        document.getElementById('edit_filtro_id').value = "";
        document.getElementById('btnSalvarFiltro').innerText = "Cadastrar Filtro";
        salvarBancoNoLocalStorage();
        trocarAba('filtros');
        renderizarTabelaFiltrosSQL("");
    } catch (err) {
        mostrarToast("Erro ao salvar filtro: " + err.message);
    }
}

function editarFiltro(id) {
    const res = db.exec(`SELECT id, codigo, aplicacao, categoria, preco FROM filtros_estoque WHERE id = ${id};`);
    if (!res.length || !res[0].values.length) return;
    const f = res[0].values[0];

    document.getElementById('edit_filtro_id').value = f[0];
    document.getElementById('cad_f_codigo').value = f[1];
    document.getElementById('cad_f_aplicacao').value = f[2];
    document.getElementById('cad_f_categoria').value = f[3] || "Filtro de Óleo";
    document.getElementById('cad_f_preco').value = f[4] || 35.00;

    document.getElementById('btnSalvarFiltro').innerText = "Atualizar Filtro";
    document.getElementById('tituloFormFiltro').innerText = `Editar Filtro: ${f[1]}`;

    trocarAba('cadastro');
    document.querySelectorAll('.sub-tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('#aba-cadastro .sub-nav-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('sub-filtro').style.display = 'block';
    document.querySelectorAll('#aba-cadastro .sub-nav-btn')[2].classList.add('active');
}

function excluirFiltro(id) {
    if (confirm("Deseja realmente excluir este filtro?")) {
        db.run("DELETE FROM filtros_estoque WHERE id = ?;", [id]);
        salvarBancoNoLocalStorage();
        renderizarTabelaFiltrosSQL("");
    }
}

function renderizarTabelaFiltrosSQL(termoBusca) {
    if (!db) return;
    const container = document.getElementById('tabelaFiltrosEstoqueContainer');
    const termo = (termoBusca || "").toLowerCase().trim();
    const res = db.exec(`SELECT id, codigo, aplicacao, categoria, preco FROM filtros_estoque WHERE LOWER(codigo) LIKE '%${termo}%' OR LOWER(aplicacao) LIKE '%${termo}%' OR LOWER(categoria) LIKE '%${termo}%' ORDER BY codigo ASC;`);

    if (!res.length || !res[0].values.length) {
        container.innerHTML = '<p>Nenhum filtro encontrado.</p>';
        return;
    }

    let html = `<table class="tabela-veiculos"><thead><tr><th>Código</th><th>Aplicação</th><th>Categoria</th><th>Preço</th><th style="width:160px; text-align:center;">Ações</th></tr></thead><tbody>`;
    res[0].values.forEach(row => {
        html += `<tr>
            <td><strong>${row[1]}</strong></td>
            <td>${row[2]}</td>
            <td>${row[3] || 'Filtro de Óleo'}</td>
            <td><strong>R$ ${(row[4] || 35.00).toFixed(2)}</strong></td>
            <td style="text-align:center; display:flex; gap:8px; justify-content:center;">
                <button class="btn btn-secundario" style="padding:6px 12px; font-size:12px;" onclick="editarFiltro(${row[0]})">✏️ Editar</button>
                <button class="btn btn-perigo" style="padding:6px 12px; font-size:12px;" onclick="excluirFiltro(${row[0]})">🗑️ Excluir</button>
            </td>
        </tr>`;
    });
    html += `</tbody></table>`;
    container.innerHTML = html;
}

function filtrarTabelaFiltrosEstoque() {
    renderizarTabelaFiltrosSQL(document.getElementById('inputBuscaFiltro').value);
}

// --- RENDERIZAÇÃO DAS TABELAS DE GERENCIAMENTO COM AÇÕES ---
function renderizarTabelaGerenciamentoVeiculos() {
    if (!db) return;
    const container = document.getElementById('listaVeiculosContainer');
    const res = db.exec("SELECT id, modelo, litros_motor FROM veiculos ORDER BY id DESC;");
    if (!res.length || !res[0].values.length) { container.innerHTML = '<p>Nenhum veículo cadastrado.</p>'; return; }
    
    let html = `<table class="tabela-veiculos"><thead><tr><th>Modelo</th><th>Litros Motor</th><th style="width:160px; text-align:center;">Ações</th></tr></thead><tbody>`;
    res[0].values.forEach(row => {
        html += `<tr>
            <td><strong>${row[1]}</strong></td>
            <td>${row[2]}L</td>
            <td style="text-align:center; display:flex; gap:8px; justify-content:center;">
                <button class="btn btn-secundario" style="padding:6px 12px; font-size:12px;" onclick="editarVeiculo(${row[0]})">✏️ Editar</button>
                <button class="btn btn-perigo" style="padding:6px 12px; font-size:12px;" onclick="excluirVeiculo(${row[0]})">🗑️ Excluir</button>
            </td>
        </tr>`;
    });
    container.innerHTML = html + `</tbody></table>`;
}

function renderizarTabelaGerenciamentoOleos() {
    if (!db) return;
    const container = document.getElementById('listaOleosContainer');
    const res = db.exec("SELECT id, nome, preco_litro, tipo FROM oleos ORDER BY preco_litro ASC;");
    if (!res.length || !res[0].values.length) { container.innerHTML = '<p>Nenhum óleo cadastrado.</p>'; return; }
    
    let html = `<table class="tabela-veiculos"><thead><tr><th>Nome</th><th>Preço/L</th><th>Tipo</th><th style="width:160px; text-align:center;">Ações</th></tr></thead><tbody>`;
    res[0].values.forEach(row => {
        html += `<tr>
            <td><strong>${row[1]}</strong></td>
            <td>R$ ${row[2].toFixed(2)}</td>
            <td>${row[3]}</td>
            <td style="text-align:center; display:flex; gap:8px; justify-content:center;">
                <button class="btn btn-secundario" style="padding:6px 12px; font-size:12px;" onclick="editarOleo(${row[0]})">✏️ Editar</button>
                <button class="btn btn-perigo" style="padding:6px 12px; font-size:12px;" onclick="excluirOleo(${row[0]})">🗑️ Excluir</button>
            </td>
        </tr>`;
    });
    container.innerHTML = html + `</tbody></table>`;
}

function renderizarTabelaGerenciamentoArruelas() {
    if (!db) return;
    const container = document.getElementById('listaArruelasContainer');
    const res = db.exec("SELECT id, nome, preco FROM arruelas ORDER BY id DESC;");
    if (!res.length || !res[0].values.length) { container.innerHTML = '<p>Nenhuma arruela cadastrada.</p>'; return; }
    
    let html = `<table class="tabela-veiculos"><thead><tr><th>Nome</th><th>Preço</th><th style="width:160px; text-align:center;">Ações</th></tr></thead><tbody>`;
    res[0].values.forEach(row => {
        html += `<tr>
            <td><strong>${row[1]}</strong></td>
            <td>R$ ${row[2].toFixed(2)}</td>
            <td style="text-align:center; display:flex; gap:8px; justify-content:center;">
                <button class="btn btn-secundario" style="padding:6px 12px; font-size:12px;" onclick="editarArruela(${row[0]})">✏️ Editar</button>
                <button class="btn btn-perigo" style="padding:6px 12px; font-size:12px;" onclick="excluirArruela(${row[0]})">🗑️ Excluir</button>
            </td>
        </tr>`;
    });
    container.innerHTML = html + `</tbody></table>`;
}

// --- CÁLCULO DO ORÇAMENTO ---


function enviarWhatsApp() {
    if (!ultimoOrcamentoTexto) return;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(ultimoOrcamentoTexto)}`, '_blank');
}

// --- IA PRO & PROCESSADOR DE AGENDAMENTOS/COMANDOS ---
function mudarModoIA() {
    const modo = document.getElementById('ia_modo').value;
    const label = document.getElementById('label_ia_input');
    const input = document.getElementById('ia_prompt_input');

    if (modo === 'consultar_placafipe') {
        label.innerText = "Cole a mensagem do cliente contendo a placa:";
        input.placeholder = "Ex: Olá, meu carro é um Celta, placa ABC-1234.";
    } else if (modo === 'agendamento_inteligente') {
        label.innerText = "Cole o lembrete de agendamento (Ex: Leide / Chery Tiggo 2):";
        input.placeholder = "📌 LEMBRETE DE AGENDAMENTO\n👤 Cliente: Leide\n📞 Telefone: 31 93122067\n🚗 Veículo: Chery Tiggo 2\n🔧 Serviço: Troca de Óleo da Transmissão Automatica\n📅 Data: 03/11/2026\n⏰ Horário: 09 hora da manhã";
    } else if (modo === 'orcamento_chat') {
        label.innerText = "Cole o lembrete de agendamento ou mensagem do cliente:";
        input.placeholder = "📌 LEMBRETE DE AGENDAMENTO\n👤 Cliente: Leide...";
    } else if (modo === 'consulta_estoque') {
        label.innerText = "O que você deseja procurar no banco de dados?";
        input.placeholder = "Ex: Chery Tiggo 2 ou filtro C1941";
    } else if (modo === 'mensagem_cobranca') {
        label.innerText = "Detalhes para o aviso / cobrança:";
        input.placeholder = "Ex: Cliente Valeria, revisão de óleo venceu esta semana.";
    }
}

function executarIAPro() {
    if (!db) { mostrarToast("Banco de dados não carregado."); return; }
    const modo = document.getElementById('ia_modo').value;
    const textoInput = document.getElementById('ia_prompt_input').value.trim();
    const containerResposta = document.getElementById('textoRespostaIA');
    const containerBotoes = document.getElementById('botoesAcaoIA');
    const bloco = document.getElementById('blocoRespostaIA');

    if (!textoInput) { mostrarToast("Por favor, digite ou cole algo para a IA analisar."); return; }

    let respostaFinal = "";
    containerBotoes.innerHTML = "";
    const nomeOficinaConfig = localStorage.getItem('cfg_nome_oficina') || 'Car Doce Car';
    const enderecoConfig = localStorage.getItem('cfg_endereco') || 'Oficina Bethânia';

    if (modo === 'consultar_placafipe') {
        // Encontra padrão de placa (ABC-1234 ou ABC1D23)
        let placaMatch = textoInput.match(/[A-Z]{3}[-]?[0-9][A-Z0-9][0-9]{2}/i);

        if (!placaMatch) {
            respostaFinal = "⚠️ A IA não conseguiu identificar nenhuma placa válida (ex: ABC-1234 ou ABC1D23) no texto enviado pelo cliente.";
        } else {
            let placaEncontrada = placaMatch[0].toUpperCase().replace("-", "");
            let urlPlacaFipe = `https://placafipe.com.br/${placaEncontrada}`;

            respostaFinal = `🌐 *PLACA IDENTIFICADA PARA CONSULTA*\n\n` +
                `🏷️ *Placa Encontrada:* ${placaMatch[0].toUpperCase()}\n\n` +
                `Como os navegadores bloqueiam consultas automáticas em sites externos (CORS), clique no botão abaixo para abrir diretamente a consulta oficial no *PlacaFipe.com.br* em uma nova aba e verificar o modelo e ano do veículo instantaneamente!`;

            // Cria botão interativo para abrir o placafipe.com.br direto na placa
            let btnFipe = document.createElement('a');
            btnFipe.href = urlPlacaFipe;
            btnFipe.target = "_blank";
            btnFipe.className = "btn";
            btnFipe.style.background = "#2563eb";
            btnFipe.innerHTML = `🔗 Consultar Placa ${placaMatch[0].toUpperCase()} no PlacaFipe`;
            containerBotoes.appendChild(btnFipe);
        }

    } else if (modo === 'agendamento_inteligente' || modo === 'orcamento_chat') {
        let clienteMatch = textoInput.match(/Cliente[:\s]+([^\n]+)/i);
        let veiculoMatch = textoInput.match(/Ve[ií]culo[:\s]+([^\n]+)/i);
        let servicoMatch = textoInput.match(/Serviço[:\s]+([^\n]+)/i);
        let dataMatch = textoInput.match(/Data[:\s]+([^\n]+)/i);
        let horarioMatch = textoInput.match(/Hor[aá]rio[:\s]+([^\n]+)/i);

        let nomeCliente = clienteMatch ? clienteMatch[1].trim() : "Cliente";
        let nomeVeiculo = veiculoMatch ? veiculoMatch[1].trim() : "Veículo";
        let servicoTexto = servicoMatch ? servicoMatch[1].trim() : "Troca de óleo";
        let dataAgendamento = dataMatch ? dataMatch[1].trim() : "Data a definir";
        let horarioAgendamento = horarioMatch ? horarioMatch[1].trim() : "Horário a definir";

        let resCheck = db.exec(`SELECT id, modelo, litros_motor, litros_cambio_aut FROM veiculos WHERE LOWER(modelo) LIKE LOWER('%${nomeVeiculo}%');`);
        let litrosCarro = 3.0;
        let litrosCambio = 6.0;
        let statusVeiculoMsg = "";

        if (resCheck.length && resCheck[0].values.length) {
            let carroDb = resCheck[0].values[0];
            nomeVeiculo = carroDb[1];
            litrosCarro = carroDb[2];
            litrosCambio = carroDb[3] || 6.0;
            statusVeiculoMsg = "Veículo já cadastrado no sistema (dados reaproveitados com sucesso).";
        } else {
            db.run(`INSERT OR IGNORE INTO veiculos (modelo, litros_motor, litros_cambio_aut, litros_cambio_man) VALUES (?, ?, ?, ?);`, [nomeVeiculo, 3.0, 6.0, 2.0]);
            salvarBancoNoLocalStorage();
            carregarSelectVeiculosSQL();
            statusVeiculoMsg = "Novo veículo cadastrado automaticamente no banco SQL!";
        }

        const isCambio = servicoTexto.toLowerCase().includes("câmbio") || servicoTexto.toLowerCase().includes("transmissão") || servicoTexto.toLowerCase().includes("cambio");
        let totalGeral = isCambio ? (litrosCambio * 85.00) + 150.00 : (litrosCarro * 48.00) + 35.00 + 6.00;
        let tempoMedio = isCambio ? "1 a 3 horas" : "30 a 40 minutos";
        let itensInclusos = isCambio ? `- Fluido de transmissão especializado (${litrosCambio}L)\n- Mão de obra especializada (Câmbio)` : `- Óleo de motor (${litrosCarro}L)\n- Filtro de óleo do motor\n- Arruela de vedação`;

        respostaFinal = `📌 *AGENDAMENTO & ORÇAMENTO PROCESSADO*\n\n` +
            `👤 *Cliente:* ${nomeCliente}\n` +
            `🚘 *Veículo:* ${nomeVeiculo}\n` +
            `📅 *Data/Horário:* ${dataAgendamento} às ${horarioAgendamento}\n` +
            `🔧 *Serviço:* ${servicoTexto}\n\n` +
            `*Itens inclusos no serviço:*\n` +
            `${itensInclusos}\n\n` +
            `💰 *Valor total:* *R$ ${totalGeral.toFixed(2)}*\n` +
            `⏱️ *Tempo médio:* ${tempoMedio}\n\n` +
            `⚙️ *Status do Banco:* ${statusVeiculoMsg}\n\n` +
            `✅ *${nomeOficinaConfig} - ${enderecoConfig} 🛠️*`;

        let btnWhats = document.createElement('button');
        btnWhats.className = "btn";
        btnWhats.style.background = "#25d366";
        btnWhats.innerHTML = "📱 Enviar no WhatsApp";
        btnWhats.onclick = copiarOuEnviarWhatsAppIA;
        containerBotoes.appendChild(btnWhats);

    } else if (modo === 'consulta_estoque') {
        const termo = textoInput.toLowerCase();
        const resFiltros = db.exec(`SELECT codigo, aplicacao, categoria, preco FROM filtros_estoque WHERE LOWER(codigo) LIKE '%${termo}%' OR LOWER(aplicacao) LIKE '%${termo}%' OR LOWER(categoria) LIKE '%${termo}%';`);
        
        respostaFinal = `🔎 *Resultados da Busca no Estoque SQL:*\n\n`;
        if (resFiltros.length && resFiltros[0].values.length) {
            resFiltros[0].values.forEach(f => {
                respostaFinal += `• Código: *${f[0]}* | ${f[2]} (${f[1]}) | Preço: *R$ ${(f[3] || 35).toFixed(2)}*\n`;
            });
        } else {
            respostaFinal += `Nenhum filtro encontrado para "${textoInput}".`;
        }
    } else if (modo === 'mensagem_cobranca') {
        respostaFinal = `🚗 *${nomeOficinaConfig} - Aviso de Manutenção*\n\n` +
            `Olá! Notamos aqui no sistema que o seu veículo está próximo da revisão preventiva.\n\n` +
            `${textoInput}\n\n` +
            `Agende seu horário na ${enderecoConfig}! 🛠️`;

        let btnWhats = document.createElement('button');
        btnWhats.className = "btn";
        btnWhats.style.background = "#25d366";
        btnWhats.innerHTML = "📱 Enviar no WhatsApp";
        btnWhats.onclick = copiarOuEnviarWhatsAppIA;
        containerBotoes.appendChild(btnWhats);
    }

    ultimaRespostaIA = respostaFinal;
    containerResposta.innerText = respostaFinal;
    bloco.style.display = 'block';
}

function copiarOuEnviarWhatsAppIA() {
    if (!ultimaRespostaIA) return;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(ultimaRespostaIA)}`, '_blank');
}

window.onload = function() {
    if (!fbAuth) { iniciarSistema(); return; } // sem configuração do Firebase: modo local
    fbAuth.onAuthStateChanged(async user => {
        if (user) {
            fecharLogin();
            if (!sistemaIniciado) { sistemaIniciado = true; await iniciarSistema(); }
        } else {
            mostrarLogin();
        }
    });
};

async function iniciarSistema() {
    await inicializarBancoSQL();

    const elemData = document.getElementById('current_date_badge');
    if (elemData) {
        const hoje = new Date();
        elemData.innerText = hoje.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    carregarSelectVeiculosSQL();
    carregarSelectsOleosSQL();
    carregarSelectArruelasOrcamento();
    carregarSelectsFiltrosOrcamento();
}


// --- GESTÃO E VISUALIZAÇÃO DO HISTÓRICO DE ORÇAMENTOS ---
function renderizarHistoricoOrcamentos() {
    if (!db) return;
    const container = document.getElementById('listaHistoricoContainer');
    if (!container) return;

    try {
        const res = db.exec("SELECT id, cliente, veiculo, servico, valor, data FROM orcamentos ORDER BY id DESC LIMIT 50;");
        if (!res.length || !res[0].values.length) {
            container.innerHTML = '<p style="color: #64748b;">Nenhum orçamento registrado até ao momento.</p>';
            return;
        }

        let html = `<table class="tabela-veiculos"><thead><tr><th>ID</th><th>Data</th><th>Veículo</th><th>Serviço</th><th>Valor Total</th><th style="width:200px; text-align:center;">Ações</th></tr></thead><tbody>`;
        res[0].values.forEach(row => {
            html += `<tr>
                <td>#${row[0]}</td>
                <td>${row[5]}</td>
                <td><strong>${row[2]}</strong></td>
                <td>${row[3]}</td>
                <td><strong style="color:#10b981;">R$ ${row[4].toFixed(2)}</strong></td>
                <td style="text-align:center; display:flex; gap:6px; justify-content:center;">
                    <button class="btn btn-secundario" style="padding:4px 8px; font-size:12px;" onclick="verECopiarOrcamento(${row[0]})">👁️ Ver / Copiar</button>
                    <button class="btn btn-perigo" style="padding:4px 8px; font-size:12px;" onclick="excluirHistorico(${row[0]})">🗑️</button>
                </td>
            </tr>`;
        });
        container.innerHTML = html + `</tbody></table>`;
    } catch(e) { console.error("Erro histórico:", e); }
}



function fecharModalOrcamento() {
    let modal = document.getElementById('modalVerOrcamento');
    if (modal) modal.remove();
}

function copiarTextoModalOrcamento() {
    let txt = document.getElementById('txtModalOrcamento');
    if (txt) {
        txt.select();
        document.execCommand('copy');
        mostrarToast("Texto do orçamento copiado para a área de transferência!");
    }
}

function enviarWhatsAppModalOrcamento() {
    let txt = document.getElementById('txtModalOrcamento');
    if (txt && txt.value) {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(txt.value)}`, '_blank');
    }
}


function excluirHistorico(id) {
    if (confirm("Deseja realmente excluir este orçamento do histórico?")) {
        try {
            db.run("DELETE FROM orcamentos WHERE id = ?;", [id]);
            salvarBancoNoLocalStorage();
            renderizarHistoricoOrcamentos();
            mostrarToast("Orçamento removido do histórico com sucesso!");
        } catch (err) {
            mostrarToast("Erro ao excluir orçamento: " + err.message, "erro");
        }
    }
}








// --- IMPORTAR PLANILHA DE ESTOQUE COM INTELIGÊNCIA DE CATEGORIA E UPSERT (ATUALIZAÇÃO) ---
function importarPlanilhaEstoque() {
    const fileInput = document.getElementById('input_arquivo_planilha');
    if (!fileInput.files || fileInput.files.length === 0) {
        mostrarToast("Por favor, selecione uma planilha Excel (.xlsx / .xls) ou ficheiro CSV.", "erro");
        return;
    }

    const file = fileInput.files[0];
    const nomeArquivo = file.name.toLowerCase();
    
    if (nomeArquivo.endsWith('.xlsx') || nomeArquivo.endsWith('.xls')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                let novosCount = 0;
                let atualizadosCount = 0;
                db.exec("BEGIN TRANSACTION;");

                jsonRows.forEach((row, index) => {
                    if (!row || row.length < 2) return;
                    
                    let col0 = String(row[0] || '').trim(); // Código
                    let col1 = String(row[1] || '').trim(); // Aplicação / Descrição
                    let col2 = String(row[2] || '').trim(); // Categoria opcional
                    let col3 = row[3]; // Preço opcional

                    // Ignorar cabeçalho
                    if (index === 0 && (col0.toLowerCase().includes('codigo') || col0.toLowerCase().includes('código') || col1.toLowerCase().includes('aplicacao') || col1.toLowerCase().includes('aplicação'))) {
                        return;
                    }

                    let codigo = col0.toUpperCase();
                    let aplicacao = col1;
                    let preco = col3 && !isNaN(parseFloat(col3)) ? parseFloat(col3) : 35.00;

                    // Identificação inteligente de categoria se não informada explicitamente
                    let categoria = 'Filtro de Óleo'; // Padrão
                    let textoAnalise = (col2 + ' ' + aplicacao).toLowerCase();

                    if (col2 && (col2.includes('Cabine') || col2.includes('Ar-Condicionado') || col2.includes('Ar Condicionado') || col2.includes('Combustível') || col2.includes('Ar do Motor'))) {
                        categoria = col2;
                    } else if (textoAnalise.includes('cabine') || textoAnalise.includes('ar condicionado') || textoAnalise.includes('ar-cond') || textoAnalise.includes('polen') || textoAnalise.includes('pólen')) {
                        categoria = 'Filtro de Ar-Condicionado (Cabine)';
                    } else if (textoAnalise.includes('combustivel') || textoAnalise.includes('combustível') || textoAnalise.includes('gasolina') || textoAnalise.includes('diesel') || textoAnalise.includes('flex')) {
                        categoria = 'Filtro de Combustível';
                    } else if (textoAnalise.includes('ar do motor') || textoAnalise.includes('elemento') || (textoAnalise.includes('ar') && !textoAnalise.includes('cabine'))) {
                        categoria = 'Filtro de Ar do Motor';
                    } else if (textoAnalise.includes('oleo') || textoAnalise.includes('óleo') || textoAnalise.includes('blindado')) {
                        categoria = 'Filtro de Óleo';
                    }

                    if (codigo && aplicacao) {
                        // Verificar se já existe
                        let check = db.exec(`SELECT id FROM filtros_estoque WHERE codigo = '${codigo}';`);
                        if (check.length && check[0].values.length) {
                            // Atualizar existente
                            db.run("UPDATE filtros_estoque SET aplicacao = ?, categoria = ?, preco = ? WHERE codigo = ?;", 
                                [aplicacao, categoria, preco, codigo]);
                            atualizadosCount++;
                        } else {
                            // Inserir novo
                            db.run("INSERT INTO filtros_estoque (codigo, aplicacao, categoria, preco) VALUES (?, ?, ?, ?);", 
                                [codigo, aplicacao, categoria, preco]);
                            novosCount++;
                        }
                    }
                });

                db.exec("COMMIT;");
                salvarBancoNoLocalStorage();
                mostrarToast(`Sucesso! ${novosCount} novos filtros adicionados e ${atualizadosCount} atualizados.`);
                fileInput.value = "";
                carregarSelectsFiltrosOrcamento();
            } catch (err) {
                db.exec("ROLLBACK;");
                mostrarToast("Erro ao processar arquivo Excel: " + err.message, "erro");
            }
        };
        reader.readAsArrayBuffer(file);
    } else {
        // Leitura para CSV/TXT com a mesma inteligência
        const reader = new FileReader();
        reader.onload = function(e) {
            const conteudo = e.target.result;
            const linhas = conteudo.split(/\r?\n/);
            let novosCount = 0;
            let atualizadosCount = 0;

            db.exec("BEGIN TRANSACTION;");
            try {
                linhas.forEach((linha, index) => {
                    if (!linha.trim()) return;
                    if (index === 0 && (linha.toLowerCase().includes('codigo') || linha.toLowerCase().includes('código') || linha.toLowerCase().includes('aplicacao'))) {
                        return;
                    }

                    let colunas = linha.includes(';') ? linha.split(';') : (linha.includes('	') ? linha.split('	') : linha.split(','));
                    
                    if (colunas.length >= 2) {
                        let codigo = colunas[0].trim().toUpperCase();
                        let aplicacao = colunas[1].trim();
                        let col2 = colunas.length >= 3 ? colunas[2].trim() : '';
                        let preco = colunas.length >= 4 && !isNaN(parseFloat(colunas[3])) ? parseFloat(colunas[3]) : 35.00;

                        let categoria = 'Filtro de Óleo';
                        let textoAnalise = (col2 + ' ' + aplicacao).toLowerCase();

                        if (col2 && (col2.includes('Cabine') || col2.includes('Ar-Condicionado') || col2.includes('Combustível') || col2.includes('Ar do Motor'))) {
                            categoria = col2;
                        } else if (textoAnalise.includes('cabine') || textoAnalise.includes('ar condicionado') || textoAnalise.includes('polen')) {
                            categoria = 'Filtro de Ar-Condicionado (Cabine)';
                        } else if (textoAnalise.includes('combustivel') || textoAnalise.includes('combustível')) {
                            categoria = 'Filtro de Combustível';
                        } else if (textoAnalise.includes('ar do motor') || textoAnalise.includes('elemento')) {
                            categoria = 'Filtro de Ar do Motor';
                        }

                        if (codigo && aplicacao) {
                            let check = db.exec(`SELECT id FROM filtros_estoque WHERE codigo = '${codigo}';`);
                            if (check.length && check[0].values.length) {
                                db.run("UPDATE filtros_estoque SET aplicacao = ?, categoria = ?, preco = ? WHERE codigo = ?;", 
                                    [aplicacao, categoria, preco, codigo]);
                                atualizadosCount++;
                            } else {
                                db.run("INSERT INTO filtros_estoque (codigo, aplicacao, categoria, preco) VALUES (?, ?, ?, ?);", 
                                    [codigo, aplicacao, categoria, preco]);
                                novosCount++;
                            }
                        }
                    }
                });
                db.exec("COMMIT;");
                salvarBancoNoLocalStorage();
                mostrarToast(`Sucesso! ${novosCount} novos filtros adicionados e ${atualizadosCount} atualizados.`);
                fileInput.value = "";
                carregarSelectsFiltrosOrcamento();
            } catch (err) {
                db.exec("ROLLBACK;");
                mostrarToast("Erro ao processar planilha: " + err.message, "erro");
            }
        };
        reader.readAsText(file, 'UTF-8');
    }
}




// --- CÁLCULO DO ORÇAMENTO COM IDENTIDADES SEPARADAS (MOTOR VS CÂMBIO) ---
function calcularOrcamento() {
    const idVeiculo = document.getElementById('veiculo').value;
    if (!idVeiculo) { mostrarToast("Por favor, selecione um veículo."); return; }

    const resVeiculo = db.exec(`SELECT modelo, litros_motor, litros_cambio_aut FROM veiculos WHERE id = ${idVeiculo};`);
    if (!resVeiculo.length || !resVeiculo[0].values.length) return;

    const veiculo = resVeiculo[0].values[0];
    const modeloCarro = veiculo[0];
    const litrosMotor = veiculo[1];
    const litrosCambioAut = veiculo[2] || 6.0;

    let totalGeral = 0;
    const dataHoje = new Date().toLocaleDateString('pt-BR');
    let itensHtml = "";
    let itensTexto = "";

    const fazerMotor = document.getElementById('chk_servico_motor').checked;
    const fazerCambio = document.getElementById('chk_servico_cambio').checked;

    let servicoDesc = "";
    let tempoMedio = "";
    const nomeOficinaConfig = localStorage.getItem('cfg_nome_oficina') || 'Car Doce Car';
    const rodapeConfig = localStorage.getItem('cfg_rodape') || 'Agende seu horário na oficina Bethânia! 🛠️';

    let cabecalhoIdentidade = "";

    if (fazerCambio) {
        // --- IDENTIDADE: TRANSMISSÃO / CÂMBIO ---
        cabecalhoIdentidade = `⚙️ ORÇAMENTO DE SERVIÇO - TRANSMISSÃO AUTOMÁTICA`;
        servicoDesc = "Troca de fluido da transmissão (Câmbio Automático)";
        tempoMedio = "1 a 3 horas";

        const precoLitroCambio = parseFloat(document.getElementById('preco_litro_cambio').value) || 85.00;
        const maoObraCambio = parseFloat(document.getElementById('valor_mao_obra_cambio').value) || 150.00;
        
        totalGeral += (litrosCambioAut * precoLitroCambio) + maoObraCambio;
        itensHtml += `- Fluido de transmissão especializado (${litrosCambioAut}L)<br>- Mão de obra técnica especializada (Câmbio)<br>- Procedimento com troca por máquina/gravidade`;
        itensTexto += `- Fluido de transmissão especializado (${litrosCambioAut}L)
- Mão de obra técnica especializada (Câmbio)
- Procedimento com troca por máquina/gravidade`;

    } else if (fazerMotor) {
        // --- IDENTIDADE: MOTOR ---
        cabecalhoIdentidade = `🚗 ORÇAMENTO DE SERVIÇO - REVISÃO DO MOTOR`;
        servicoDesc = "Troca completa do óleo do motor e filtros";
        tempoMedio = "30 a 40 minutos";
        
        const precoLitroMotor = parseFloat(document.getElementById('preco_litro_motor').value) || 0;
        totalGeral += (litrosMotor * precoLitroMotor);
        itensHtml += `- Óleo de motor (${litrosMotor}L)<br>`;
        itensTexto += `- Óleo de motor (${litrosMotor}L)`;

        const selectsFiltros = [
            { id: 'select_filtro_oleo', nome: 'Filtro de óleo do motor' },
            { id: 'select_filtro_ar', nome: 'Filtro de ar do motor' },
            { id: 'select_filtro_combustivel', nome: 'Filtro de combustível' },
            { id: 'select_filtro_cabine', nome: 'Filtro de ar-condicionado (cabine)' }
        ];

        selectsFiltros.forEach(sf => {
            const sel = document.getElementById(sf.id);
            if (sel && sel.value) {
                const opt = sel.options[sel.selectedIndex];
                const precoFiltro = parseFloat(opt.dataset.preco) || 35.00;
                totalGeral += precoFiltro;
                itensHtml += `- ${sf.nome}<br>`;
                itensTexto += `\n- ${sf.nome}`;
            }
        });

        const selArruela = document.getElementById('select_arruela');
        if (selArruela && selArruela.value) {
            const optArruela = selArruela.options[selArruela.selectedIndex];
            const precoArruela = parseFloat(optArruela.dataset.preco) || 6.00;
            totalGeral += precoArruela;
            itensHtml += `- ${optArruela.text.split(' - ')[0]}<br>`;
            itensTexto += `\n- ${optArruela.text.split(' - ')[0]}`;
        } else {
            const resArruela = db.exec("SELECT preco FROM arruelas LIMIT 1;");
            let precoArruela = resArruela.length ? resArruela[0].values[0][0] : 6.00;
            totalGeral += precoArruela;
            itensHtml += `- Arruela de vedação<br>`;
            itensTexto += `\n- Arruela de vedação`;
        }
    }

    let resumoHtml = `<b>${cabecalhoIdentidade}</b><br><b>🛠️ ${nomeOficinaConfig}</b><br><br>` +
        `🚘 <b>Veículo:</b> ${modeloCarro}<br>` +
        `📅 <b>Data:</b> ${dataHoje}<br><br>` +
        `🔧 <b>Serviço:</b> ${servicoDesc}<br><br>` +
        `<b>Itens inclusos no serviço:</b><br>` +
        `${itensHtml}<br><br>` +
        `💰 <b>Valor total: R$ ${totalGeral.toFixed(2)}</b><br>` +
        `⏱️ <b>Tempo estimado:</b> ${tempoMedio}<br><br>` +
        `<b>Formas de pagamento:</b><br>` +
        `- PIX ou dinheiro<br>` +
        `- Cartão de crédito/débito<br><br>` +
        `<i>${rodapeConfig}</i>`;

    ultimoOrcamentoTexto = `${cabecalhoIdentidade}
🛠️ ${nomeOficinaConfig}

🚘 Veículo: ${modeloCarro}
📅 Data: ${dataHoje}

🔧 Serviço: ${servicoDesc}

Itens inclusos no serviço:
${itensTexto}

💰 Valor total: R$ ${totalGeral.toFixed(2)}
⏱️ Tempo estimado: ${tempoMedio}

Formas de pagamento:
- PIX ou dinheiro
- Cartão de crédito/débito

${rodapeConfig}`;

    try {
        db.run("INSERT INTO orcamentos (cliente, veiculo, servico, valor, data) VALUES (?, ?, ?, ?, ?);", 
            ["Cliente Balcão", modeloCarro, servicoDesc, totalGeral, dataHoje]);
        salvarBancoNoLocalStorage();
        renderizarHistoricoOrcamentos();
    } catch(e) { console.error("Erro ao salvar histórico:", e); }

    document.getElementById('textoResumo').innerHTML = resumoHtml;
    document.getElementById('blocoResultado').style.display = 'block';
}

function verECopiarOrcamento(id) {
    if (!db) return;
    const res = db.exec(`SELECT id, cliente, veiculo, servico, valor, data FROM orcamentos WHERE id = ${id};`);
    if (!res.length || !res[0].values.length) return;

    const row = res[0].values[0];
    const idOrc = row[0];
    const cliente = row[1];
    const veiculo = row[2];
    const servico = row[3];
    const valor = row[4];
    const data = row[5];

    const nomeOficinaConfig = localStorage.getItem('cfg_nome_oficina') || 'Car Doce Car';
    const rodapeConfig = localStorage.getItem('cfg_rodape') || 'Agende seu horário na oficina Bethânia! 🛠️';

    const isCambio = servico.toLowerCase().includes('câmbio') || servico.toLowerCase().includes('transmissão') || servico.toLowerCase().includes('cambio');
    const cabecalho = isCambio ? "⚙️ ORÇAMENTO DE SERVIÇO - TRANSMISSÃO AUTOMÁTICA" : "🚗 ORÇAMENTO DE SERVIÇO - REVISÃO DO MOTOR";
    const tempoEstimado = isCambio ? "1 a 3 horas" : "30 a 40 minutos";

    let textoFormatado = `${cabecalho}
🛠️ ${nomeOficinaConfig}

` +
        `🚘 Veículo: ${veiculo}
` +
        `👤 Cliente: ${cliente}
` +
        `📅 Data: ${data}

` +
        `🔧 Serviço: ${servico}

` +
        `💰 Valor total: R$ ${valor.toFixed(2)}
` +
        `⏱️ Tempo estimado: ${tempoEstimado}

` +
        `Formas de pagamento:
` +
        `- PIX ou dinheiro
` +
        `- Cartão de crédito/débito

` +
        `${rodapeConfig}`;

    ultimoOrcamentoTexto = textoFormatado;

    let modalExistente = document.getElementById('modalVerOrcamento');
    if (modalExistente) modalExistente.remove();

    let modal = document.createElement('div');
    modal.id = 'modalVerOrcamento';
    modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); display:flex; align-items:center; justify-content:center; z-index:10000;';
    
    modal.innerHTML = `
        <div style="background:#fff; border-radius:12px; padding:24px; width:90%; max-width:550px; box-shadow:0 10px 25px rgba(0,0,0,0.3); position:relative;">
            <h3 style="margin-top:0; color:#1e293b;">📄 Detalhes do Orçamento #${idOrc}</h3>
            <textarea id="txtModalOrcamento" style="width:100%; height:230px; font-family:monospace; padding:10px; border-radius:8px; border:1px solid #cbd5e1; font-size:13px; resize:vertical;">${textoFormatado}</textarea>
            <div style="display:flex; gap:10px; margin-top:16px; justify-content:flex-end; flex-wrap:wrap;">
                <button class="btn btn-secundario" onclick="copiarTextoModalOrcamento()">📋 Copiar Texto</button>
                <button class="btn" style="background:#25d366; color:white;" onclick="enviarWhatsAppModalOrcamento()">📱 Enviar WhatsApp</button>
                <button class="btn btn-perigo" onclick="fecharModalOrcamento()">Fechar</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}



// --- CONSULTA PROFISSIONAL DE PLACA E FIPE VIA API ---








// --- CONFIGURAÇÕES PRO & BANCO ---
function salvarConfiguracoesPro() {
    const nome = document.getElementById('cfg_nome_oficina').value;
    const cnpj = document.getElementById('cfg_cnpj').value;
    const telefone = document.getElementById('cfg_telefone').value;
    const endereco = document.getElementById('cfg_endereco').value;
    const pix = document.getElementById('cfg_chave_pix').value;
    const moMotor = document.getElementById('cfg_mo_motor').value;
    const moCambio = document.getElementById('cfg_mo_cambio').value;
    const rodape = document.getElementById('cfg_rodape').value;

    localStorage.setItem('cfg_nome_oficina', nome);
    localStorage.setItem('cfg_cnpj', cnpj);
    localStorage.setItem('cfg_telefone', telefone);
    localStorage.setItem('cfg_endereco', endereco);
    localStorage.setItem('cfg_chave_pix', pix);
    localStorage.setItem('cfg_mo_motor', moMotor);
    localStorage.setItem('cfg_mo_cambio', moCambio);
    localStorage.setItem('cfg_rodape', rodape);

    atualizarTituloTopoSite();
    mostrarToast("Todas as configurações da oficina foram salvas com sucesso!");
}

function carregarConfiguracoesNaTela() {
    const nome = localStorage.getItem('cfg_nome_oficina');
    const cnpj = localStorage.getItem('cfg_cnpj');
    const telefone = localStorage.getItem('cfg_telefone');
    const endereco = localStorage.getItem('cfg_endereco');
    const pix = localStorage.getItem('cfg_chave_pix');
    const moMotor = localStorage.getItem('cfg_mo_motor');
    const moCambio = localStorage.getItem('cfg_mo_cambio');
    const rodape = localStorage.getItem('cfg_rodape');

    if (nome && document.getElementById('cfg_nome_oficina')) document.getElementById('cfg_nome_oficina').value = nome;
    if (cnpj && document.getElementById('cfg_cnpj')) document.getElementById('cfg_cnpj').value = cnpj;
    if (telefone && document.getElementById('cfg_telefone')) document.getElementById('cfg_telefone').value = telefone;
    if (endereco && document.getElementById('cfg_endereco')) document.getElementById('cfg_endereco').value = endereco;
    if (pix && document.getElementById('cfg_chave_pix')) document.getElementById('cfg_chave_pix').value = pix;
    if (moMotor && document.getElementById('cfg_mo_motor')) document.getElementById('cfg_mo_motor').value = moMotor;
    if (moCambio && document.getElementById('cfg_mo_cambio')) document.getElementById('cfg_mo_cambio').value = moCambio;
    if (rodape && document.getElementById('cfg_rodape')) document.getElementById('cfg_rodape').value = rodape;

    atualizarTituloTopoSite();
}

function restaurarBackupBanco(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const conteudo = e.target.result;
            JSON.parse(conteudo); // Valida JSON
            localStorage.setItem('oficina_sqlite_db', conteudo);
            mostrarToast("Backup restaurado com sucesso! Recarregando sistema...");
            setTimeout(() => location.reload(), 1500);
        } catch (err) {
            mostrarToast("Ficheiro de backup inválido: " + err.message, "erro");
        }
    };
    reader.readAsText(file);
}



// --- IA STOQCAR PRO ULTRA REVISADA (RESPOSTA IMEDIATA) ---
function executarIAPro() {
    console.log("IA Pro acionada...");
    const modoSelect = document.getElementById('ia_modo');
    const promptInput = document.getElementById('ia_prompt_input');
    const textoResposta = document.getElementById('textoRespostaIA');
    const containerBotoes = document.getElementById('botoesAcaoIA');

    if (!modoSelect || !promptInput || !textoResposta || !containerBotoes) {
        alert("Erro crítico: Elementos da IA não encontrados no DOM.");
        return;
    }

    const modo = modoSelect.value;
    const textoInput = promptInput.value.trim();

    if (!textoInput) {
        if (typeof mostrarToast === 'function') {
            mostrarToast("Por favor, cole ou digite um texto para a IA processar.", "erro");
        } else {
            alert("Por favor, digite ou cole algo para a IA analisar.");
        }
        return;
    }

    textoResposta.innerHTML = "⏳ A processar dados com a Inteligência Pro...";
    containerBotoes.innerHTML = "";

    setTimeout(() => {
        let respostaFinal = "";
        const nomeOficina = (typeof localStorage !== 'undefined' && localStorage.getItem('cfg_nome_oficina')) || 'Car Doce Car';
        const telefoneOficina = (typeof localStorage !== 'undefined' && localStorage.getItem('cfg_telefone')) || '(31) 98888-8888';

        if (modo === 'agendamento_inteligente') {
            let clienteMatch = textoInput.match(/(?:cliente|nome)[:\s]*([a-zA-Zá-úÁ-Ú\s]+)/i);
            let veiculoMatch = textoInput.match(/(?:veiculo|carro|modelo)[:\s]*([a-zA-Z0-9á-úÁ-Ú\s]+)/i);
            let servicoMatch = textoInput.match(/(?:servico|serviço|manutencao)[:\s]*([a-zA-Z0-9á-úÁ-Ú\s]+)/i);
            let dataMatch = textoInput.match(/\d{2}\/\d{2}\/\d{4}/);
            let horaMatch = textoInput.match(/\d{1,2}(?:h|\s*hora|:)/i);

            let cliente = clienteMatch ? clienteMatch[1].trim() : "Cliente";
            let veiculo = veiculoMatch ? veiculoMatch[1].trim() : "Veículo";
            let servico = servicoMatch ? servicoMatch[1].trim() : "Revisão Geral / Troca de Óleo";
            let data = dataMatch ? dataMatch[0] : "Próxima data disponível";

            respostaFinal = `🚀 *AGENDAMENTO PROCESSADO COM SUCESSO*\n\n` +
                `👤 *Cliente:* ${cliente}\n` +
                `🚗 *Veículo:* ${veiculo}\n` +
                `🔧 *Serviço:* ${servico}\n` +
                `📅 *Data Estimada:* ${data}\n\n` +
                `✅ Tudo pronto! O Stoqcar registou os dados da${nomeOficina}. Clique abaixo para confirmar o agendamento diretamente com o cliente no WhatsApp.`;

            let msgZap = encodeURIComponent(`Olá ${cliente}! Confirmamos o seu agendamento na ${nomeOficina} para o veículo ${veiculo} (${servico}) na data ${data}. Estamos à sua espera! 🛠️`);
            containerBotoes.innerHTML = `<a href="https://api.whatsapp.com/send?text=${msgZap}" target="_blank" class="btn btn-whatsapp" style="padding:12px 20px; font-weight:bold; border-radius:8px; text-decoration:none; display:inline-flex; align-items:center; gap:8px;">💬 Enviar Confirmação no WhatsApp</a>`;

        } else if (modo === 'consultar_placafipe') {
            let placaMatch = textoInput.match(/[A-Z]{3}[-]?[0-9][A-Z0-9][0-9]{2}/i);
            if (!placaMatch) {
                respostaFinal = "⚠️ Nenhuma placa válida (ex: ABC-1234 ou ABC1D23) foi encontrada no texto fornecido.";
            } else {
                let placa = placaMatch[0].toUpperCase().replace("-", "");
                respostaFinal = `🌐 *PLACA ANALISADA COM SUCESSO*\n\n🏷️ *Placa:* ${placaMatch[0].toUpperCase()}\n\nPara consultar a Tabela FIPE e histórico oficial deste veículo instantaneamente, clique no link abaixo:`;
                containerBotoes.innerHTML = `<a href="https://placafipe.com.br/${placa}" target="_blank" class="btn" style="background:#2563eb; color:white; padding:12px 20px; font-weight:bold; border-radius:8px; text-decoration:none;">🔍 Abrir Consulta Oficial PlacaFipe</a>`;
            }

        } else if (modo === 'orcamento_chat') {
            respostaFinal = `💬 *ANÁLISE DE ORÇAMENTO EM TEXTO*\n\nO Stoqcar leu o resumo enviado:\n-----------------------------------\n${textoInput}\n-----------------------------------\n\n💡 *Sugestão:* Copie os valores e crie o orçamento oficial diretamente na aba 'Orçamento' para salvar no banco SQLite da oficina.`;

        } else if (modo === 'consulta_estoque') {
            if (typeof db !== 'undefined' && db) {
                try {
                    let res = db.exec(`SELECT codigo, aplicacao, categoria, preco FROM filtros_estoque WHERE aplicacao LIKE '%${textoInput}%' OR codigo LIKE '%${textoInput}%';`);
                    if (res.length && res[0].values.length) {
                        respostaFinal = `📦 *ITENS ENCONTRADOS NO ESTOQUE SQL:*\n\n`;
                        res[0].values.forEach(row => {
                            respostaFinal += `🔹 *Código:* ${row[0]} | *Aplicação:* ${row[1]} | *Cat:* ${row[2]} | *Preço:* R$ ${Number(row[3]).toFixed(2)}\n`;
                        });
                    } else {
                        respostaFinal = `🔍 Nenhum filtro ou peça correspondente a "${textoInput}" foi encontrado no banco de dados local.`;
                    }
                } catch (e) {
                    respostaFinal = `Erro ao consultar banco SQLite: ${e.message}`;
                }
            } else {
                respostaFinal = "⚠️ Banco de dados SQLite não inicializado.";
            }

        } else if (modo === 'mensagem_cobranca') {
            let matchNome = textoInput.match(/(?:cliente|nome)[:\s]*([a-zA-Zá-úÁ-Ú\s]+)/i);
            let nomeCli = matchNome ? matchNome[1].trim() : "Cliente";
            respostaFinal = `💰 *MENSAGEM HUMANIZADA GERADA*\n\nOlá ${nomeCli}, tudo bem? Notamos aqui no sistema da ${nomeOficina} que o seu veículo está próximo da revisão preventiva de óleo e filtros para garantir o máximo desempenho. Passando para saber quando deseja agendar um horário connosco! 🛠️`;
            let msgCob = encodeURIComponent(`Olá ${nomeCli}, tudo bem? Notamos aqui no sistema da ${nomeOficina} que o seu veículo está próximo da revisão preventiva de óleo e filtros. Passando para saber quando deseja agendar um horário connosco! 🛠️`);
            containerBotoes.innerHTML = `<a href="https://api.whatsapp.com/send?text=${msgCob}" target="_blank" class="btn btn-whatsapp" style="padding:12px 20px; font-weight:bold; border-radius:8px; text-decoration:none;">💬 Enviar Mensagem no WhatsApp</a>`;
        }

        textoResposta.innerHTML = respostaFinal;
    }, 150);
}
