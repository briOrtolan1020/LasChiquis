# CoquetteChat Desktop

App de escritorio interna estilo WhatsApp para equipos pequeños, hecha con **Electron + React + Tailwind + Socket.IO + Express + SQLite**.

## Qué incluye
- Login y registro
- Chats privados
- Grupos
- Mensajes en tiempo real
- Adjuntar imágenes, PDFs y otros archivos
- Vista previa de imágenes
- Notificaciones de escritorio
- Diseño coquette pastel
- Base SQLite local en el servidor

## Estructura
- `desktop-client/` → app de escritorio
- `server/` → API + Socket.IO + SQLite

## Requisitos
- Node.js LTS reciente. Electron recomienda usar una versión LTS de Node, y Vite 7 requiere Node 20.19+ o 22.12+. citeturn583470search21turn583470search1

## Instalación
### 1) Servidor
```bash
cd server
npm install
npm run dev
```
El servidor quedará en `http://localhost:4000`.

### 2) App de escritorio
En otra terminal:
```bash
cd desktop-client
npm install
npm run electron:dev
```

## Build de producción
### Renderer React
```bash
cd desktop-client
npm run build
```

### Empaquetar escritorio
```bash
cd desktop-client
npm run dist
```
Electron se instala como dependencia de desarrollo y se puede empaquetar con Electron Builder/Forge; Vite compila el frontend para producción. citeturn583470search15turn583470search12turn583470search19

## Notas técnicas
- Socket.IO da comunicación bidireccional en tiempo real y reconexión automática. citeturn583470search10turn583470search6
- Multer maneja `multipart/form-data` para subir archivos. citeturn583470search3
- Si querés usarla en red interna, cambiá `localhost` por la IP de la PC donde corra el servidor.

## Próximas mejoras sugeridas
- audios
- mensajes editables/eliminables
- estados
- videollamadas
- permisos por rol
- cifrado más fuerte y refresh tokens
