import { io } from "socket.io-client";

const serverUrl = import.meta.env.VITE_SERVER_URL?.trim() || undefined;

export const socket = io(serverUrl, {
  autoConnect: false
});
