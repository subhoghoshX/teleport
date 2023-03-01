import negotiate from "@/utils/negotiate";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import clsx from "clsx";

const socket = io({
  autoConnect: false,
});

interface ConnectionDetail {
  pc: RTCPeerConnection;
  userId: string;
  username: string;
}

type User = {
  userId: string;
  username: string;
};

export default function Channel() {
  const [users, setUsers] = useState<Record<string, ConnectionDetail>>({});
  const [userName, setUserName] = useState("");
  const [showJoinScreen, setShowJoinScreen] = useState(true);

  const router = useRouter();

  const downloadRef = useRef<null | HTMLAnchorElement>(null);

  useEffect(() => {
    socket.on("new-user-list", (userList: User[]) => {
      const socketId = socket.id;

      setUsers((oldUsers) => {
        const usersObj = { ...oldUsers };

        userList.forEach(({ userId, username }) => {
          if (!usersObj[userId] && userId !== socketId) {
            const pc = new RTCPeerConnection({
              iceServers: [
                {
                  urls: ["stun:stun1.l.google.com:19302"],
                },
              ],
            });

            pc.ondatachannel = (e) => {
              let buffer = [];
              let receivedFileSize = 0;

              const { fileSize, fileName } = JSON.parse(e.channel.label);

              e.channel.onmessage = (event) => {
                buffer.push(event.data);
                receivedFileSize += event.data.byteLength;

                console.log({ receivedFileSize });
                if (receivedFileSize === fileSize) {
                  const received = new Blob(buffer);
                  buffer = [];

                  if (!downloadRef.current) return;
                  downloadRef.current.href = URL.createObjectURL(received);
                  downloadRef.current.download = fileName;
                  downloadRef.current.textContent = `Download ${fileName}`;
                }

                console.log("msg => ", event.data);
              };
              console.log("on data channel event fired");
            };

            pc.onicecandidate = (event) => {
              if (event.candidate) {
                socket.emit("new-ice-candidate", {
                  senderId: socketId,
                  receiverId: userId,
                  candidate: event.candidate.toJSON(),
                });
              }
            };

            pc.onnegotiationneeded = () => {
              negotiate(pc, socket, socketId, userId);
            };

            usersObj[userId] = {
              pc,
              userId,
              username,
            };
          }
        });

        Object.keys(usersObj).forEach((id) => {
          if (userList.map((user) => user.userId).indexOf(id) < 0) {
            usersObj[id].pc.close();
            delete usersObj[id];
          }
        });

        return usersObj;
      });
    });

    //attach other socket listeners
    socket.on("offer-event", async ({ offer, senderId }) => {
      // only a variable is enough
      const socketId = socket.id;

      await users[senderId].pc.setRemoteDescription(
        new RTCSessionDescription(offer),
      );

      if (offer.type === "offer") {
        await users[senderId].pc.setRemoteDescription(
          new RTCSessionDescription(offer),
        );

        console.log("receive offer => ", offer);
        const answer = await users[senderId].pc.createAnswer();
        await users[senderId].pc.setLocalDescription(answer);

        socket.emit("offer-event", {
          offer: answer,
          senderId: socketId,
          receiverId: senderId,
        });
        console.log("send answer => ", answer);
      }

      if (offer.type === "answer") {
        console.log("received answer => ", offer);
      }
    });

    socket.on("new-ice-candidate", ({ senderId, candidate, receiverId }) => {
      users[senderId].pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    return () => {
      socket.removeAllListeners("new-user-list");
      socket.removeAllListeners("offer-event");
      socket.removeAllListeners("new-ice-candidate");
    };
  }, [users]);

  return (
    <div>
      <h1>This is a chanel</h1>

      <div
        className={clsx(
          "fixed inset-0 z-10 flex items-center justify-center bg-zinc-900/95",
          { hidden: !showJoinScreen },
        )}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setShowJoinScreen(false);
            socket.auth = {
              username: userName,
              room: router.query.room,
            };
            socket.connect();
            socket.emit("join", userName);
          }}
        >
          <label htmlFor="username" className="text-white">
            Enter Your Name:
          </label>
          <input
            type="text"
            id="username"
            className="mt-2 block rounded px-4 py-2"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />
          <button className="mt-2 block w-full rounded bg-blue-500 px-4 py-2 text-white">
            Join
          </button>
        </form>
      </div>

      <form action="">
        <input type="file" name="" id="file-input" />
        <button
          className="bg-blue-500 px-4 py-2"
          onClick={(e) => {
            e.preventDefault();

            const fileInput: HTMLInputElement | null =
              document.querySelector("#file-input");
            const file = fileInput?.files?.[0];

            console.log(file.size, file.name);

            const channelName = JSON.stringify({
              fileName: file.name,
              fileSize: file.size,
            });

            Object.values(users).forEach((user) => {
              const channel = user.pc.createDataChannel(channelName);

              channel.onopen = () => {
                const fileReader = new FileReader();

                let offset = 0;

                fileReader.addEventListener("load", (e) => {
                  channel.send(e.target.result);
                  offset += e.target.result.byteLength;
                  if (offset < file.size) {
                    readSlice(offset);
                  }
                });

                function readSlice(o: number) {
                  const slice = file.slice(offset, o + 16384);
                  fileReader.readAsArrayBuffer(slice);
                }

                readSlice(0);
              };
            });
          }}
        >
          Send File
        </button>
      </form>

      <button
        className="bg-red-500 px-4 py-2"
        onClick={() => {
          Object.values(users).forEach((user) => {
            const channel = user.pc.createDataChannel("some-channel");
            channel.onopen = () => {
              channel.send("does it work");
              console.log("send some data btw");
            };
          });
        }}
      >
        Send some data
      </button>

      <a href="" ref={downloadRef}></a>
    </div>
  );
}
