import negotiate from "@/utils/negotiate";
import { useRouter } from "next/router";
import { FormEvent, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import clsx from "clsx";
import DownloadButton from "@/components/DownloadButton";

const socket = io({
  autoConnect: false,
});

interface ConnectionDetail {
  pc: RTCPeerConnection;
  userId: string;
  username: string;
  selectedForSending: boolean;
}

type User = {
  userId: string;
  username: string;
};

export type File = {
  id: number;
  fileName: string;
  href: string | undefined;
  receivedFileSize: number;
  totalFileSize: number;
  sender: string;
};

export default function Channel() {
  const [users, setUsers] = useState<Record<string, ConnectionDetail>>({});
  const [userName, setUserName] = useState("");
  const [showJoinScreen, setShowJoinScreen] = useState(true);
  const [files, setFiles] = useState<File[]>([]);

  const router = useRouter();

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
              let buffer: Buffer[] = [];
              let receivedFileSize = 0;

              const { fileSize, fileName, sender } = JSON.parse(
                e.channel.label,
              );

              e.channel.onmessage = (event) => {
                buffer.push(event.data);
                receivedFileSize += event.data.byteLength;

                setFiles((files) => {
                  if (
                    files.filter((file) => file.id === e.channel.id).length ===
                    0
                  ) {
                    return [
                      ...files,
                      {
                        receivedFileSize: 0,
                        id: e.channel.id as number,
                        href: undefined,
                        fileName,
                        totalFileSize: fileSize,
                        sender,
                      },
                    ];
                  }

                  return files.map((file) =>
                    file.id === e.channel.id
                      ? { ...file, receivedFileSize }
                      : file,
                  );
                });

                if (receivedFileSize === fileSize) {
                  const received = new Blob(buffer);
                  buffer = [];

                  setFiles((files) =>
                    files.map((file) =>
                      file.id === e.channel.id
                        ? { ...file, href: URL.createObjectURL(received) }
                        : file,
                    ),
                  );
                }
              };
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
              selectedForSending: true,
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

  function sendFile(e: FormEvent) {
    e.preventDefault();

    const fileInput: HTMLInputElement | null =
      document.querySelector("#file-input");
    const file = fileInput?.files?.[0];

    if (!file) return;

    console.log(file.size, file.name);

    const channelName = JSON.stringify({
      fileName: file.name,
      fileSize: file.size,
      sender: userName,
    });

    Object.values(users)
      .filter((user) => user.selectedForSending)
      .forEach((user) => {
        const channel = user.pc.createDataChannel(channelName);

        channel.onopen = () => {
          const fileReader = new FileReader();

          let offset = 0;

          fileReader.addEventListener("load", (e) => {
            const result = fileReader.result as ArrayBuffer;
            channel.send(result);
            offset += result.byteLength;
            if (offset < file.size) {
              readSlice(offset);
            }
          });

          function readSlice(o: number) {
            const slice = file?.slice(offset, o + 16384);
            slice && fileReader.readAsArrayBuffer(slice);
          }

          readSlice(0);
        };
      });
  }

  function socketConnect(e: FormEvent) {
    e.preventDefault();
    setShowJoinScreen(false);
    socket.auth = {
      username: userName,
      room: router.query.room,
    };
    socket.connect();
  }

  return (
    <>
      <div
        className={clsx(
          "fixed inset-0 z-10 flex items-center justify-center bg-zinc-900/95",
          { hidden: !showJoinScreen },
        )}
      >
        <form onSubmit={socketConnect}>
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

      <main className="flex min-h-screen items-center justify-center bg-zinc-900 p-8 text-white">
        <div className="flex w-full flex-col gap-8 sm:w-auto lg:flex-row">
          <div className="flex flex-col gap-8">
            <form
              action=""
              className="rounded-2xl bg-zinc-700/70 p-8 lg:min-w-[500px]"
            >
              <input type="file" name="" id="file-input" className="w-full" />
            </form>
            <div className="min-h-[250px] rounded-2xl bg-zinc-700/70 p-8 lg:min-h-[384px]">
              <p>Send the selected file to:</p>
              <ul>
                {Object.values(users).map((user, i) => (
                  <li key={i} className="mt-5 flex items-center gap-x-4">
                    <input
                      type="checkbox"
                      id={user.userId}
                      className="h-4 w-4"
                      checked={user.selectedForSending}
                      onChange={(e) => {
                        setUsers((users) => {
                          const usersCopy = { ...users };

                          usersCopy[user.userId].selectedForSending =
                            e.target.checked;

                          return usersCopy;
                        });
                      }}
                    />
                    <label htmlFor={user.userId} className="select-none">
                      {user.username}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
            <button
              className="rounded-2xl border border-cyan-800 bg-cyan-900 px-4 py-3 hover:bg-cyan-900/90"
              onClick={sendFile}
            >
              Send File
            </button>
          </div>
          <div className="min-h-[200px] rounded-2xl bg-zinc-700/70 p-8 lg:min-w-[384px]">
            Received files:
            <ul className="mt-4 space-y-3 text-sm">
              {files.map((file, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-xl bg-zinc-600 px-3 py-2"
                >
                  <div>
                    <p>{file.fileName}</p>
                    <p className="italic text-zinc-400">From: {file.sender}</p>
                  </div>
                  <DownloadButton fileInfo={file} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
    </>
  );
}
