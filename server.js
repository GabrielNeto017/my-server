const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid'); // você pode manter o uuid se quiser, mas não é usado no envio sem espera de resposta

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let microSocket = null;
let stressTestActive = false;

// Middleware para aceitar body mesmo em GET
app.use((req, res, next) => {
  if (req.method === 'GET') {
    let raw = '';
    req.on('data', chunk => raw += chunk);
    req.on('end', () => {
      try {
        req.body = raw ? JSON.parse(raw) : {};
      } catch (e) {
        req.body = {};
      }
      next();
    });
  } else {
    next();
  }
});

app.use(express.json());

// Função para enviar comando para o micro e responder IMEDIATAMENTE ao HTTP
function enviarParaMicro(req, res, tipo, dados = {}) {
  if (!microSocket || microSocket.readyState !== WebSocket.OPEN) {
    return res.status(503).send('Microcontrolador não conectado.');
  }

  const payload = {
    tipo,
    metodo: req.method.toUpperCase(),
    body: dados
  };

  try {
    microSocket.send(JSON.stringify(payload));
    // Resposta rápida, não espera retorno do micro
    res.status(200).send(`Comando '${tipo}' (${req.method}) enviado ao microcontrolador.`);
  } catch (err) {
    res.status(500).send(`Erro ao enviar: ${err.message}`);
  }
}

// Rotas POST
app.post('/login', (req, res) => {
  enviarParaMicro(req, res, 'login', req.body);
});

const rotasPOST = [
  'logout', 'add_tag', 'save_tag',
  'user_create', 'user_delete', 'user_edit',
  'set_system_time',
  'department_create', 'department_delete',
  'holidays_create', 'holidays_delete',
  'set_system_network', 'save_sensor',
  'factory_reset', 'delete_admins',
  'save_reader', 'save_interlock',
  'save_alarms'
];

rotasPOST.forEach((rota) => {
  app.post(`/${rota}`, (req, res) => {
    enviarParaMicro(req, res, rota, req.body);
  });
});

// Rotas GET que aceitam body
const rotasGET = [
  'user_credentials', 'user_list',
  'department_list', 'get_sensors',
  'system_information', 'get_readers',
  'get_interlock', 'get_alarms'
];

rotasGET.forEach((rota) => {
  app.get(`/${rota}`, (req, res) => {
    enviarParaMicro(req, res, rota, req.body);
  });
});

// Rota /enviar para teste de estresse
app.get('/enviar', async (req, res) => {
  if (!microSocket || microSocket.readyState !== WebSocket.OPEN) {
    return res.status(503).send('Microcontrolador não conectado.');
  }

  if (stressTestActive) {
    return res.status(400).send('Teste de estresse já em execução.');
  }

  stressTestActive = true;
  res.status(200).send('Teste de estresse iniciado.');

  let counter = 0;
  while (stressTestActive && microSocket.readyState === WebSocket.OPEN) {
    const msg = JSON.stringify({
      tipo: 'login',
      metodo: 'POST',
      body: {
        login: `admin${counter}`,
        password: `pass${counter}`
      }
    });

    try {
      microSocket.send(msg);
      console.log(`Mensagem ${counter} enviada`);
    } catch (err) {
      console.error("Erro ao enviar:", err.message);
      break;
    }

    counter++;
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  console.log("Teste de estresse finalizado.");
});

// Parar o teste de estresse
app.get('/parar', (req, res) => {
  stressTestActive = false;
  res.send("Teste de estresse interrompido.");
});

// WebSocket
wss.on('connection', (ws) => {
  console.log("Microcontrolador conectado via WebSocket");
  microSocket = ws;

  ws.on('message', (message) => {
    try {
      const msgStr = message.toString('utf8');
      console.log('📨 Mensagem recebida do micro:', msgStr);
    } catch (e) {
      console.error("❌ Erro ao converter mensagem:", e.message);
    }
  });

  ws.on('close', () => {
    console.log('Microcontrolador desconectado.');
    microSocket = null;
    stressTestActive = false;
  });
});

// Iniciar servidor
server.listen(3100, () => {
  console.log('Servidor rodando em http://localhost:3100');
});
