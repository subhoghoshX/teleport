import { Socket } from "socket.io-client";

export default async function negotiate(
  pc: RTCPeerConnection,
  socket: Socket,
  senderId: string,
  receiverId: string,
) {
  console.log("negotiating with userid", senderId);
  const offer = await pc.createOffer();

  await pc.setLocalDescription(offer);

  socket.emit("offer-event", { senderId, receiverId, offer: offer });

  console.log("send offer => ", offer);
}
