/* @galebridge/widget v0.1.0 */
(function(global){"use strict";const exports={};
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isEnvelope = exports.isRecord = exports.VERSION = exports.CHANNEL = void 0;
exports.validateConfig = validateConfig;
exports.validateWalletRequest = validateWalletRequest;
exports.createWidget = createWidget;
exports.createEvmAdapter = createEvmAdapter;
exports.createTronAdapter = createTronAdapter;
exports.CHANNEL = 'gale-widget';
exports.VERSION = 1;
const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);
exports.isRecord = isRecord;
const isEnvelope = (value) => (0, exports.isRecord)(value) &&
    value.channel === exports.CHANNEL &&
    value.version === exports.VERSION &&
    typeof value.instanceId === 'string' &&
    typeof value.type === 'string';
exports.isEnvelope = isEnvelope;
function validateConfig(input) {
    if (!(0, exports.isRecord)(input))
        throw new Error('Invalid widget configuration');
    const result = {};
    for (const key of [
        'clientId',
        'fromChainId',
        'toChainId',
        'fromTokenAddress',
        'toTokenAddress',
        'amount',
        'receiver',
        'slippage',
    ]) {
        if (input[key] !== undefined) {
            if (typeof input[key] !== 'string' || input[key].length > 256)
                throw new Error(`Invalid ${key}`);
            result[key] = input[key];
        }
    }
    for (const key of ['fromChainId', 'toChainId']) {
        if (result[key] !== undefined && !/^[1-9]\d*$/.test(result[key]))
            throw new Error(`Invalid ${key}`);
    }
    if (result.amount !== undefined && !/^\d+(\.\d+)?$/.test(result.amount))
        throw new Error('Invalid amount');
    if (result.slippage !== undefined &&
        (!/^0\.\d+$/.test(result.slippage) ||
            Number(result.slippage) <= 0 ||
            Number(result.slippage) > 0.5))
        throw new Error('Slippage must be between 0 and 0.5');
    if (input.theme !== undefined) {
        if (input.theme !== 'light' && input.theme !== 'dark')
            throw new Error('Invalid theme');
        result.theme = input.theme;
    }
    if (input.lang !== undefined) {
        if (input.lang !== 'en' && input.lang !== 'zh')
            throw new Error('Invalid language');
        result.lang = input.lang;
    }
    if (input.protocol !== undefined) {
        if (!['all', 'v1', 'v2'].includes(input.protocol))
            throw new Error('Invalid protocol');
        result.protocol = input.protocol;
    }
    if (input.accentColor !== undefined) {
        if (typeof input.accentColor !== 'string' || !/^#[\da-f]{6}$/i.test(input.accentColor))
            throw new Error('Invalid accentColor');
        result.accentColor = input.accentColor;
    }
    if (input.lockDestination !== undefined) {
        if (typeof input.lockDestination !== 'boolean')
            throw new Error('Invalid lockDestination');
        result.lockDestination = input.lockDestination;
    }
    if (result.lockDestination && (!result.toChainId || !result.toTokenAddress))
        throw new Error('Locked destination needs a chain and token');
    if (input.allowedChains !== undefined) {
        if (!Array.isArray(input.allowedChains) ||
            input.allowedChains.length > 100 ||
            !input.allowedChains.every((v) => typeof v === 'string' && /^[1-9]\d*$/.test(v)))
            throw new Error('Invalid allowedChains');
        result.allowedChains = [...input.allowedChains];
    }
    if (input.allowedTokens !== undefined) {
        if (!Array.isArray(input.allowedTokens) ||
            input.allowedTokens.length > 500 ||
            !input.allowedTokens.every((v) => (0, exports.isRecord)(v) &&
                typeof v.chainId === 'string' &&
                /^[1-9]\d*$/.test(v.chainId) &&
                typeof v.address === 'string' &&
                v.address.length <= 128))
            throw new Error('Invalid allowedTokens');
        result.allowedTokens = input.allowedTokens.map((v) => ({
            chainId: v.chainId,
            address: v.address,
        }));
    }
    return result;
}
const decimal = (v) => typeof v === 'string' && /^\d{1,78}$/.test(v) && BigInt(v) < 2n ** 256n;
const chain = (v) => typeof v === 'string' && /^[1-9]\d{0,19}$/.test(v);
const address = (v) => typeof v === 'string' && (/^0x[\da-f]{40}$/i.test(v) || /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(v));
function validateWalletRequest(value) {
    if (!(0, exports.isRecord)(value))
        throw new Error('Invalid wallet request');
    if (value.method === 'connect' || value.method === 'account')
        return;
    if (value.method === 'switchChain' && chain(value.chainId))
        return;
    if (value.method === 'receipt' &&
        chain(value.chainId) &&
        typeof value.hash === 'string' &&
        /^(0x)?[\da-f]{64}$/i.test(value.hash))
        return;
    if ((value.method === 'allowance' || value.method === 'approve') &&
        chain(value.chainId) &&
        address(value.token) &&
        address(value.owner) &&
        address(value.spender) &&
        (value.method !== 'approve' || decimal(value.amount)))
        return;
    const tx = value.transaction;
    if (value.method === 'sendTransaction' &&
        (0, exports.isRecord)(tx) &&
        chain(tx.chainId) &&
        address(tx.from) &&
        address(tx.to) &&
        typeof tx.data === 'string' &&
        /^0x([\da-f]{2}){4,}$/i.test(tx.data) &&
        tx.data.length < 262144 &&
        (tx.value === undefined || decimal(tx.value)))
        return;
    throw new Error('Unsupported or malformed wallet request');
}
function createWidget(options) {
    if (typeof window === 'undefined')
        throw new Error('Mount the widget in a browser after the container exists');
    const container = typeof options.container === 'string'
        ? document.querySelector(options.container)
        : options.container;
    if (!(container instanceof HTMLElement))
        throw new Error('Widget container not found');
    const url = new URL(options.widgetUrl ?? 'https://galebridge.net/widget');
    if (url.username ||
        url.password ||
        url.hash ||
        (url.protocol !== 'https:' &&
            !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))))
        throw new Error('Widget URL must use HTTPS (or loopback HTTP)');
    if (window.location.origin === 'null')
        throw new Error('Serve the host page over HTTP(S), not file://');
    let config = validateConfig(options);
    const instanceId = crypto.randomUUID();
    url.search = new URLSearchParams({ instanceId, parentOrigin: window.location.origin }).toString();
    const iframe = document.createElement('iframe');
    iframe.title = 'Gale Bridge';
    iframe.src = url.toString();
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox');
    iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    iframe.style.cssText = 'width:100%;height:740px;border:0;display:block;border-radius:20px;';
    const listeners = new Map();
    const wallets = { ...options.wallets };
    const inFlight = new Set();
    const processed = new Set();
    let destroyed = false;
    let initialized = false;
    let resolveReady;
    let rejectReady;
    const ready = new Promise((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
    });
    // Callers may use only events; still prevent an unhandled rejection on teardown.
    void ready.catch(() => { });
    const emit = (type, payload) => {
        for (const handler of listeners.get(type) ?? []) {
            try {
                handler(payload);
            }
            catch (error) {
                console.error('[Gale Widget listener]', error);
            }
        }
    };
    const post = (type, payload, requestId) => {
        if (!destroyed)
            iframe.contentWindow?.postMessage({ channel: exports.CHANNEL, version: exports.VERSION, instanceId, type, payload, requestId }, url.origin);
    };
    const init = () => post('init', config);
    const timer = window.setTimeout(() => {
        rejectReady(new Error('Widget initialization timed out'));
        emit('error', { code: 'INIT_TIMEOUT', message: 'Widget initialization timed out' });
    }, 30000);
    const receive = async (event) => {
        if (destroyed ||
            event.origin !== url.origin ||
            event.source !== iframe.contentWindow ||
            !(0, exports.isEnvelope)(event.data) ||
            event.data.instanceId !== instanceId)
            return;
        const { type, payload, requestId } = event.data;
        if (type === 'hello') {
            init();
            return;
        }
        if (type === 'ready') {
            window.clearTimeout(timer);
            if (!initialized) {
                initialized = true;
                resolveReady();
                emit('ready', { version: exports.VERSION });
            }
            return;
        }
        if (type === 'resize' && typeof payload === 'number' && Number.isFinite(payload)) {
            iframe.style.height = `${Math.max(360, Math.min(1600, payload))}px`;
            return;
        }
        if (type === 'walletRequest') {
            if (!initialized ||
                typeof requestId !== 'string' ||
                requestId.length > 100 ||
                inFlight.has(requestId) ||
                processed.has(requestId))
                return;
            inFlight.add(requestId);
            try {
                if (!(0, exports.isRecord)(payload) || (payload.ecosystem !== 'evm' && payload.ecosystem !== 'tron'))
                    throw new Error('Invalid ecosystem');
                validateWalletRequest(payload.request);
                const adapter = wallets[payload.ecosystem];
                if (!adapter)
                    throw new Error(`No ${payload.ecosystem.toUpperCase()} wallet adapter. Connect a host wallet first.`);
                const result = await adapter.request(payload.request);
                post('walletResult', { result }, requestId);
            }
            catch (error) {
                post('walletResult', {
                    error: error instanceof Error ? error.message : String(error),
                    code: (0, exports.isRecord)(error) && typeof error.code === 'number' ? error.code : undefined,
                }, requestId);
            }
            finally {
                inFlight.delete(requestId);
                processed.add(requestId);
                if (processed.size > 1000)
                    processed.delete(processed.values().next().value);
            }
            return;
        }
        if (type === 'event' &&
            (0, exports.isRecord)(payload) &&
            [
                'needConnect',
                'connected',
                'transactionSent',
                'statusChanged',
                'completed',
                'error',
            ].includes(String(payload.name)) &&
            (0, exports.isRecord)(payload.data))
            emit(String(payload.name), payload.data);
    };
    window.addEventListener('message', receive);
    iframe.addEventListener('load', init);
    container.appendChild(iframe);
    return {
        iframe,
        ready,
        on(event, handler) {
            if (destroyed)
                throw new Error('Widget was destroyed');
            const handlers = listeners.get(event) ?? new Set();
            handlers.add(handler);
            listeners.set(event, handlers);
            return () => {
                handlers.delete(handler);
            };
        },
        update(patch) {
            if (destroyed)
                throw new Error('Widget was destroyed');
            config = validateConfig({ ...config, ...patch });
            post('config', config);
        },
        setWallet(ecosystem, adapter) {
            if (destroyed)
                throw new Error('Widget was destroyed');
            if (ecosystem !== 'evm' && ecosystem !== 'tron')
                throw new Error('Invalid ecosystem');
            wallets[ecosystem] = adapter;
            post('walletChanged', { ecosystem });
        },
        destroy() {
            if (destroyed)
                return;
            destroyed = true;
            window.clearTimeout(timer);
            rejectReady(new Error('Widget was destroyed'));
            window.removeEventListener('message', receive);
            iframe.removeEventListener('load', init);
            iframe.remove();
            listeners.clear();
        },
    };
}
const hexQuantity = (v) => `0x${BigInt(v).toString(16)}`;
const word = (v) => v.replace(/^0x/, '').toLowerCase().padStart(64, '0');
function createEvmAdapter(provider) {
    const account = async (connect = false) => {
        const accounts = (await provider.request({
            method: connect ? 'eth_requestAccounts' : 'eth_accounts',
        }));
        if (!accounts?.[0])
            throw new Error('Connect an EVM wallet');
        return {
            address: accounts[0],
            chainId: BigInt((await provider.request({ method: 'eth_chainId' }))).toString(),
        };
    };
    const assertAccount = async (chainId, owner) => {
        const active = await account();
        if (active.chainId !== chainId ||
            (owner && active.address.toLowerCase() !== owner.toLowerCase()))
            throw new Error('Wallet account or chain changed. Reconnect and request a new quote.');
        return active;
    };
    return {
        async request(request) {
            validateWalletRequest(request);
            if (('token' in request && !/^0x[\da-f]{40}$/i.test(request.token)) ||
                ('owner' in request && !/^0x[\da-f]{40}$/i.test(request.owner)) ||
                ('spender' in request && !/^0x[\da-f]{40}$/i.test(request.spender)) ||
                (request.method === 'sendTransaction' &&
                    ![request.transaction.from, request.transaction.to].every((value) => /^0x[\da-f]{40}$/i.test(value))))
                throw new Error('EVM requests require EVM addresses');
            switch (request.method) {
                case 'connect':
                    return account(true);
                case 'account':
                    return account();
                case 'switchChain': {
                    await provider.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: hexQuantity(request.chainId) }],
                    });
                    return assertAccount(request.chainId);
                }
                case 'allowance': {
                    await assertAccount(request.chainId, request.owner);
                    const result = await provider.request({
                        method: 'eth_call',
                        params: [
                            {
                                to: request.token,
                                data: `0xdd62ed3e${word(request.owner)}${word(request.spender)}`,
                            },
                            'latest',
                        ],
                    });
                    return BigInt(result).toString();
                }
                case 'approve': {
                    await assertAccount(request.chainId, request.owner);
                    return provider.request({
                        method: 'eth_sendTransaction',
                        params: [
                            {
                                from: request.owner,
                                to: request.token,
                                value: '0x0',
                                data: `0x095ea7b3${word(request.spender)}${word(BigInt(request.amount).toString(16))}`,
                            },
                        ],
                    });
                }
                case 'sendTransaction': {
                    const tx = request.transaction;
                    await assertAccount(tx.chainId, tx.from);
                    return provider.request({
                        method: 'eth_sendTransaction',
                        params: [
                            { from: tx.from, to: tx.to, data: tx.data, value: hexQuantity(tx.value ?? '0') },
                        ],
                    });
                }
                case 'receipt': {
                    await assertAccount(request.chainId);
                    const result = (await provider.request({
                        method: 'eth_getTransactionReceipt',
                        params: [request.hash],
                    }));
                    return result?.status === '0x1'
                        ? 'success'
                        : result?.status === '0x0'
                            ? 'failed'
                            : 'pending';
                }
            }
        },
    };
}
function createTronAdapter(provider) {
    const account = async (connect = false) => {
        if (connect)
            await provider.request({ method: 'tron_requestAccounts' });
        const address = provider.tronWeb.defaultAddress.base58;
        if (!address)
            throw new Error('Connect a TRON wallet');
        // Wallet node must be mainnet; Nile/Shasta providers must not sign mainnet quotes.
        let chainId;
        try {
            chainId = BigInt((await provider.request({ method: 'eth_chainId' }))).toString();
        }
        catch {
            /* Legacy TronLink does not expose eth_chainId. */
        }
        const host = provider.tronWeb.fullNode?.host;
        if (chainId
            ? chainId !== '728126428'
            : !host || new URL(host).origin !== 'https://api.trongrid.io')
            throw new Error('Select TRON mainnet. Custom legacy RPCs require a host wallet adapter that verifies the network.');
        return { address, chainId: '728126428' };
    };
    const assertAccount = async (chainId, owner) => {
        const active = await account();
        if (active.chainId !== chainId || (owner && active.address !== owner))
            throw new Error('TRON account or network changed');
        return active;
    };
    return {
        async request(request) {
            validateWalletRequest(request);
            const tronWeb = provider.tronWeb;
            switch (request.method) {
                case 'connect':
                    return account(true);
                case 'account':
                    return account();
                case 'switchChain':
                    return assertAccount(request.chainId);
                case 'allowance': {
                    await assertAccount(request.chainId, request.owner);
                    const token = await tronWeb.contract().at(request.token);
                    const value = await token.allowance(request.owner, request.spender).call();
                    return BigInt(value._hex ?? value.toString()).toString();
                }
                case 'approve': {
                    await assertAccount(request.chainId, request.owner);
                    const token = await tronWeb.contract().at(request.token);
                    return token.approve(request.spender, request.amount).send({ feeLimit: 100000000 });
                }
                case 'sendTransaction': {
                    const tx = request.transaction;
                    await assertAccount(tx.chainId, tx.from);
                    if (!tronWeb.isAddress(tx.to))
                        throw new Error('Invalid TRON contract');
                    const value = Number(tx.value ?? '0');
                    if (!Number.isSafeInteger(value))
                        throw new Error('TRX value exceeds safe wallet range');
                    const result = await tronWeb.transactionBuilder.triggerSmartContract(tx.to, '', { input: tx.data.replace(/^0x/, ''), callValue: value, feeLimit: 150000000 }, [], tx.from);
                    if (!result.result?.result || !result.transaction)
                        throw new Error('TRON transaction simulation failed');
                    const signed = await tronWeb.trx.sign(result.transaction);
                    if (!signed?.signature?.length || typeof signed.txID !== 'string')
                        throw new Error('TRON transaction was not signed');
                    // Once signed, always return its known hash, including ambiguous broadcast failures.
                    // The UI must track this transaction rather than construct another one.
                    try {
                        await tronWeb.trx.sendRawTransaction(signed);
                    }
                    catch {
                        /* Track the known hash. */
                    }
                    return signed.txID;
                }
                case 'receipt': {
                    await assertAccount(request.chainId);
                    const info = await tronWeb.trx.getTransactionInfo(request.hash);
                    if (!info?.blockNumber)
                        return 'pending';
                    const tx = await tronWeb.trx.getTransaction(request.hash);
                    const status = tx.ret?.[0]?.contractRet;
                    return status === 'SUCCESS'
                        ? 'success'
                        : typeof status === 'string' && status !== ''
                            ? 'failed'
                            : 'pending';
                }
            }
        },
    };
}

global.GaleBridge=exports;
})(globalThis);
