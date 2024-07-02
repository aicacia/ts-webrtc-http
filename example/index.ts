import { Peer } from "@aicacia/simplepeer";
import { createWebRTCFetch, createWebRTCServer } from "../src";

/**
 * create a JWT for this server to connect to the WebSocket
 * @returns {string}
 */
async function authenticate(type: "server" | "client") {
	const body: { id: string; password: string } = {
		id: "some-globally-unique-id",
		password: "password",
	};
	const headers: HeadersInit = {
		"Content-Type": "application/json",
	};
	if (type === "server") {
		headers.Authorization = `Bearer ${process.env.JWT_TOKEN}`;
	}
	const res = await fetch(`${process.env.P2P_API_URL}/${type}`, {
		method: "POST",
		headers,
		credentials: "same-origin",
		mode: "cors",
		body: JSON.stringify(body),
	});
	if (res.status >= 400) {
		throw new Error("failed to authenticate");
	}
	return await res.text();
}
/**
 * starts WebSocket and listens for new clients, creates a WebRTC connection for new clients
 */
async function initServer() {
	const peers: { [id: string]: Peer } = {};
	const token = await authenticate("server");
	const socket = new WebSocket(
		`${process.env.P2P_WS_URL}/server/websocket?token=${token}`,
	);
	socket.addEventListener("open", () => {
		socket.addEventListener("message", async (event) => {
			const message = JSON.parse(event.data);
			switch (message.type) {
				case "join": {
					const peerId = message.from;
					const peer = new Peer({
						trickle: true,
						channelConfig: {
							ordered: true,
						},
					});
					peer.on("error", (err) => console.log("error", err));
					peer.on("signal", (data) => {
						socket.send(JSON.stringify({ to: peerId, payload: data }));
					});
					peer.on("connect", () => {
						createWebRTCServer(
							peer.getChannel() as RTCDataChannel,
							(request) => {
								console.log(request);
								return new Response(request.body, {
									status: 200,
									headers: request.headers,
								});
							},
						);
					});
					peer.on("close", () => {
						delete peers[peerId];
					});
					peers[peerId] = peer;
					break;
				}
				case "leave": {
					console.log(`leave ${message.from}`);
					break;
				}
				case "message": {
					const peerId = message.from;
					const peer = peers[peerId];
					peer.signal(message.payload);
				}
			}
		});
	});
}
/**
 * starts WebSocket and signals the server to create a WebRTC connection
 */
async function initClient() {
	const token = await authenticate("client");
	const socket = new WebSocket(
		`${process.env.P2P_WS_URL}/client/websocket?token=${token}`,
	);
	socket.addEventListener("open", async () => {
		const peer = new Peer({
			trickle: true,
			channelConfig: {
				ordered: true,
			},
		});
		socket.addEventListener("message", (event) => {
			peer.signal(JSON.parse(event.data));
		});
		peer.on("error", (err) => console.log("error", err));
		peer.on("signal", (data) => {
			socket.send(JSON.stringify(data));
		});
		peer.on("connect", () => {
			window.clientFetch = createWebRTCFetch(
				peer.getChannel() as RTCDataChannel,
			);
		});
		await peer.init();
	});
}

async function onLoad() {
	// add #server to the browser tab's url you want to act as the server
	const url = new URL(window.location.href);
	const isServer = url.searchParams.has("server");
	if (isServer) {
		await initServer();
	} else {
		await initClient();
	}
}

declare global {
	interface Window {
		clientFetch: typeof fetch;
	}
}

if (document.readyState === "complete") {
	onLoad();
} else {
	window.addEventListener("load", onLoad);
}
