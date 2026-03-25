const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://192.168.1.171:5173",
  "https://coquettechat-client-chiquis.vercel.app",
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`No permitido por CORS: ${origin}`));
    },
    methods: ["GET", "POST"],
    credentials: true,
  })
);

app.use(express.json());

const dataDir = path.join(__dirname, "..", "data");
const uploadsDir = path.join(dataDir, "uploads");
const messagesFile = path.join(dataDir, "messages.json");

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(messagesFile)) fs.writeFileSync(messagesFile, "[]", "utf8");

app.use("/uploads", express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`;
    cb(null, safeName);
  },
});

const upload = multer({ storage });

function getBaseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

app.post("/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, error: "No se recibió ningún archivo." });
    }

    const isImage = req.file.mimetype.startsWith("image/");
    const baseUrl = getBaseUrl(req);

    return res.json({
      ok: true,
      attachment: {
        type: isImage ? "image" : "file",
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        url: `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`,
      },
    });
  } catch (error) {
    console.error("Error en /upload:", error);
    return res.status(500).json({
      ok: false,
      error: "Error subiendo archivo.",
    });
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`No permitido por CORS: ${origin}`));
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const PRESET_USERS = [
  { id: "lucia", nombre: "Lucia", avatar: "🌷" },
  { id: "jenifer", nombre: "Jenifer", avatar: "🩷" },
  { id: "brisa", nombre: "Brisa", avatar: "✨" },
  { id: "estela", nombre: "Estela", avatar: "🌸" },
  { id: "natalia", nombre: "Natalia", avatar: "💐" },
];

const onlineUsers = new Map();

function readMessages() {
  try {
    const raw = fs.readFileSync(messagesFile, "utf8");
    return JSON.parse(raw || "[]");
  } catch (error) {
    console.error("Error leyendo messages.json:", error);
    return [];
  }
}

function writeMessages(messages) {
  try {
    fs.writeFileSync(messagesFile, JSON.stringify(messages, null, 2), "utf8");
  } catch (error) {
    console.error("Error escribiendo messages.json:", error);
  }
}

function buildPrivateChatId(userA, userB) {
  return ["private", userA, userB].sort().join(":");
}

function getChatId(payload) {
  if (payload.chatType === "group") return "group:oficina";
  return buildPrivateChatId(payload.from, payload.to);
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildStateForUser(userId) {
  const allMessages = readMessages();

  const visibleMessages = allMessages.filter((msg) => {
    if (msg.chatType === "group") return true;
    return msg.from === userId || msg.to === userId;
  });

  const unread = {};

  for (const msg of visibleMessages) {
    const mine = msg.from === userId;
    if (!mine && !(msg.readBy || []).includes(userId)) {
      unread[msg.chatId] = (unread[msg.chatId] || 0) + 1;
    }
  }

  return {
    users: PRESET_USERS,
    messages: visibleMessages,
    unread,
  };
}

io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);

  socket.on("register_user", (userId) => {
    if (!userId) return;

    onlineUsers.set(userId, socket.id);
    socket.data.userId = userId;

    const state = buildStateForUser(userId);
    socket.emit("initial_state", state);

    io.emit("presence_update", {
      onlineUserIds: Array.from(onlineUsers.keys()),
    });
  });

  socket.on("send_message", (payload) => {
    const { from, to = null, chatType, text = "", attachment = null } = payload || {};
    if (!from || !chatType) return;

    const trimmedText = String(text || "").trim();
    if (!trimmedText && !attachment) return;

    const newMessage = {
      id: Date.now().toString(),
      from,
      to,
      chatType,
      chatId: getChatId({ from, to, chatType }),
      text: trimmedText,
      attachment,
      createdAt: new Date().toISOString(),
      time: formatTime(new Date()),
      readBy: [from],
    };

    const messages = readMessages();
    messages.push(newMessage);
    writeMessages(messages);

    const recipients = new Set([from]);

    if (chatType === "group") {
      PRESET_USERS.forEach((u) => recipients.add(u.id));
    } else if (to) {
      recipients.add(to);
    }

    recipients.forEach((userId) => {
      const targetSocketId = onlineUsers.get(userId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("new_message", newMessage);
      }
    });
  });

  socket.on("mark_read", ({ userId, chatId }) => {
    if (!userId || !chatId) return;

    const messages = readMessages();
    let changed = false;

    const updated = messages.map((msg) => {
      if (msg.chatId !== chatId) return msg;
      if ((msg.readBy || []).includes(userId)) return msg;

      changed = true;
      return {
        ...msg,
        readBy: [...(msg.readBy || []), userId],
      };
    });

    if (changed) {
      writeMessages(updated);
      const targetSocketId = onlineUsers.get(userId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("read_updated", { chatId, userId });
      }
    }
  });

  socket.on("disconnect", () => {
    const userId = socket.data.userId;
    if (userId) {
      onlineUsers.delete(userId);
      io.emit("presence_update", {
        onlineUserIds: Array.from(onlineUsers.keys()),
      });
    }
    console.log("Cliente desconectado:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});