import SimplePeer from 'simple-peer';
import { createWebRTCFetch, createWebRTCServer } from '../src';

/**
 * create a JWT for this server to connect to the WebSocket
 * @returns {string}
 */
async function authenticate(type: 'server' | 'client', secret: string) {
	const res = await fetch(`${process.env.P2P_API_URL}/${type}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ id: 'webrtc-example', password: secret })
	});
	if (res.status >= 400) {
		throw new Error('failed to authenticate');
	}
	return await res.text();
}
const peers: { [id: string]: SimplePeer.Instance } = {};
/**
 * starts WebSocket and listens for new clients, creates a WebRTC connection for new clients
 */
async function initServer(secret: string) {
	const token = await authenticate('server', secret);
	const socket = new WebSocket(`${process.env.P2P_WS_URL}/server/websocket?token=${token}`);
	socket.addEventListener('open', () => {
		socket.addEventListener('message', (event) => {
			const message = JSON.parse(event.data);
			switch (message.type) {
				case 'join': {
					const peerId = message.from;
					const peer = (peers[peerId] = new SimplePeer({
						initiator: false,
						trickle: true,
						channelConfig: {
							ordered: true
						}
					}));
					peer.on('error', (err) => console.log('error', err));
					peer.on('signal', (data) => {
						socket.send(JSON.stringify({ to: peerId, payload: data }));
					});
					peer.on('connect', () => {
						const _removeWebRTCListener = createWebRTCServer(peer._channel, (request) => {
							console.log(request);
							return new Response(request.body, {
								status: 200,
								headers: request.headers
							});
						});
					});
					peer.on('disconnect', () => {
						peer.destroy();
						delete peers[peerId];
					});
					break;
				}
				case 'leave': {
					console.log(`leave ${message.from}`);
					break;
				}
				case 'message': {
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
async function initClient(secret: string) {
	const token = await authenticate('client', secret);
	const socket = new WebSocket(`${process.env.P2P_WS_URL}/client/websocket?token=${token}`);
	socket.addEventListener('open', () => {
		const peer = new SimplePeer({
			initiator: true,
			trickle: true,
			channelConfig: {
				ordered: true
			}
		});
		socket.addEventListener('message', (event) => {
			peer.signal(JSON.parse(event.data));
		});
		peer.on('error', (err) => console.log('error', err));
		peer.on('signal', (data) => {
			socket.send(JSON.stringify(data));
		});
		peer.on('connect', () => {
			window.clientFetch = createWebRTCFetch(peer._channel);
			// after we have connected over WebRTC close the client's WebSocket
			socket.close();
		});
	});
}

async function onLoad() {
	// add #server to the browser tab's url you want to act as the server
	const url = new URL(window.location.href);
	const isServer = url.searchParams.has('server');
	const secret = url.searchParams.get('secret') as string;
	if (isServer) {
		await initServer(secret);
	} else {
		await initClient(secret);
	}
}

declare global {
	interface Window {
		clientFetch: typeof fetch;
	}
}

if (document.readyState === 'complete') {
	onLoad();
} else {
	window.addEventListener('load', onLoad);
}
