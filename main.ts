  return response;
});
const userID = "83584bae-0489-4aca-9921-a065922afc0b";

const uuidBytes = new Uint8Array(16);
const hexString = userID.replace(/-/g, '');
for (let i = 0; i < 16; i++) {
  uuidBytes[i] = parseInt(hexString.substr(i * 2, 2), 16);
}

Deno.serve(async (req) => {
  const upgrade = req.headers.get("upgrade") || "";
  
  if (upgrade.toLowerCase() !== "websocket") {
    return new Response("Deno VLESS is Active and Running!", { status: 200 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  let tcpConn: Deno.Conn | null = null;

  socket.onmessage = async (event) => {
    const data = new Uint8Array(event.data as ArrayBuffer);

    if (!tcpConn) {
      if (data.length < 24) return socket.close();

      const version = data[0];
      for (let i = 0; i < 16; i++) {
        if (data[i + 1] !== uuidBytes[i]) return socket.close();
      }

      const optLen = data[17];
      let offset = 18 + optLen;
      const cmd = data[offset++];
      
      if (cmd !== 1) return socket.close(); 

      const port = (data[offset] << 8) | data[offset + 1];
      offset += 2;

      const addrType = data[offset++];
      let hostname = "";
      if (addrType === 1) {
        hostname = data.slice(offset, offset + 4).join(".");
        offset += 4;
      } else if (addrType === 2) {
        const len = data[offset++];
        hostname = new TextDecoder().decode(data.slice(offset, offset + len));
        offset += len;
      } else if (addrType === 3) {
        const ipv6 = [];
        for (let i = 0; i < 8; i++) {
          ipv6.push(((data[offset + i * 2] << 8) | data[offset + i * 2 + 1]).toString(16));
        }
        hostname = ipv6.join(":");
        offset += 16;
      } else {
        return socket.close();
      }

      const payload = data.slice(offset);

      try {
        tcpConn = await Deno.connect({ hostname, port });
        socket.send(new Uint8Array([version, 0]));
        
        if (payload.length > 0) {
          await tcpConn.write(payload);
        }

        (async () => {
          const buf = new Uint8Array(32768);
          try {
            while (true) {
              const n = await tcpConn.read(buf);
              if (n === null) break;
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(buf.subarray(0, n));
              }
            }
          } catch (e) {
          } finally {
            socket.close();
          }
        })();

      } catch (err) {
        socket.close();
      }
    } else {
      try {
        await tcpConn.write(data);
      } catch (e) {
        socket.close();
      }
    }
  };

  socket.onclose = () => {
    if (tcpConn) {
      try { tcpConn.close(); } catch (e) {}
    }
  };

  return response;
});
