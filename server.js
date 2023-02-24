const express = require("express");
const next = require("next");
const http = require("http");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const nextApp = next({ dev });

const handle = nextApp.getRequestHandler();

nextApp.prepare().then(() => {
  const app = express();

  const server = http.createServer(app);
  const io = new Server(server);

  app.get("*", (req, res) => {
    return handle(req, res);
  });

  io.on("connection", async (socket) => {
    const room = socket.handshake.auth.room;
    socket.join(room);

    async function getAllSockets() {
      const sockets = await io.in(room).fetchSockets();
      return sockets.map((socket) => ({
        userId: socket.id,
        username: socket.handshake.auth.username,
      }));
    }
    const sockets = await getAllSockets();

    io.to(room).emit("new-user-list", sockets);

    console.log("one user connected");

    socket.on("offer-event", (arg) => {
      io.to(arg.receiverId).emit("offer-event", arg);
    });

    socket.on("new-ice-candidate", (arg) => {
      console.log("forwarding candidate to", arg.receiverId);
      io.to(arg.receiverId).emit("new-ice-candidate", arg);
    });

    socket.on("disconnect", async () => {
      // send down userlist again when someone disconnects
      const sockets = await getAllSockets();

      io.to(room).emit("new-user-list", sockets);
      console.log("user disconnected");
    });
  });

  server.listen(8080, "0.0.0.0");
});
