import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { SessionStore } from '../../src/session/SessionStore.js'
import { InMemorySessionStore } from '../../src/session/InMemorySessionStore.js'
import type { ConversationContext } from '../../src/types/index.js'


describe( 'SessionStore', () => {

    let store: SessionStore


    beforeEach( () => {
        const result = SessionStore.create()
        store = result.store
    } )


    afterEach( () => {
        store.stopCleanup()
    } )


    it( 'creates with InMemorySessionStore as default backend', () => {
        const { store: created } = SessionStore.create()

        expect( created ).toBeInstanceOf( SessionStore )
    } )


    it( 'creates with a custom backend', () => {
        const backend = new InMemorySessionStore()
        const { store: created } = SessionStore.create( { backend } )

        expect( created ).toBeInstanceOf( SessionStore )
    } )


    it( 'addMessage stores a message', async () => {
        await store.addMessage( { sessionId: 'sess-1', role: 'user', content: 'Hello' } )

        const { contextPrefix } = await store.getContext( { sessionId: 'sess-1' } )

        expect( contextPrefix ).toContain( '[user]: Hello' )
    } )


    it( 'addMessage stores multiple messages in order', async () => {
        await store.addMessage( { sessionId: 'sess-1', role: 'user', content: 'Question' } )
        await store.addMessage( { sessionId: 'sess-1', role: 'assistant', content: 'Answer' } )

        const { contextPrefix } = await store.getContext( { sessionId: 'sess-1' } )

        expect( contextPrefix ).toContain( '[user]: Question' )
        expect( contextPrefix ).toContain( '[assistant]: Answer' )
        expect( contextPrefix.indexOf( '[user]: Question' ) ).toBeLessThan(
            contextPrefix.indexOf( '[assistant]: Answer' )
        )
    } )


    it( 'enforces 50 message limit by removing oldest', async () => {
        const promises = Array.from( { length: 55 } ).map( ( _, i ) =>
            store.addMessage( { sessionId: 'sess-limit', role: 'user', content: `msg-${i}` } )
        )

        // add sequentially to preserve order
        await promises.reduce( ( chain, p ) => chain.then( () => p ), Promise.resolve() )

        const { contextPrefix } = await store.getContext( { sessionId: 'sess-limit' } )

        expect( contextPrefix ).not.toContain( 'msg-0' )
        expect( contextPrefix ).not.toContain( 'msg-4' )
        expect( contextPrefix ).toContain( 'msg-5' )
        expect( contextPrefix ).toContain( 'msg-54' )
    } )


    it( 'enforces custom message limit', async () => {
        const { store: smallStore } = SessionStore.create( { maxMessages: 3 } )

        await smallStore.addMessage( { sessionId: 's1', role: 'user', content: 'a' } )
        await smallStore.addMessage( { sessionId: 's1', role: 'assistant', content: 'b' } )
        await smallStore.addMessage( { sessionId: 's1', role: 'user', content: 'c' } )
        await smallStore.addMessage( { sessionId: 's1', role: 'assistant', content: 'd' } )

        const { contextPrefix } = await smallStore.getContext( { sessionId: 's1' } )

        expect( contextPrefix ).not.toContain( '[user]: a' )
        expect( contextPrefix ).toContain( '[assistant]: b' )
        expect( contextPrefix ).toContain( '[user]: c' )
        expect( contextPrefix ).toContain( '[assistant]: d' )
    } )


    it( 'getContext returns empty string when no messages', async () => {
        const { contextPrefix } = await store.getContext( { sessionId: 'nonexistent' } )

        expect( contextPrefix ).toBe( '' )
    } )


    it( 'getContext returns formatted context with header and footer', async () => {
        await store.addMessage( { sessionId: 'sess-fmt', role: 'user', content: 'Hi' } )

        const { contextPrefix } = await store.getContext( { sessionId: 'sess-fmt' } )

        expect( contextPrefix ).toMatch( /^\[Conversation Context\]\n/ )
        expect( contextPrefix ).toMatch( /\[End Context\]\n\n$/ )
    } )


    it( 'clearContext deletes the session', async () => {
        await store.addMessage( { sessionId: 'sess-clear', role: 'user', content: 'temp' } )
        await store.clearContext( { sessionId: 'sess-clear' } )

        const { contextPrefix } = await store.getContext( { sessionId: 'sess-clear' } )

        expect( contextPrefix ).toBe( '' )
    } )


    it( 'handles multiple sessions independently', async () => {
        await store.addMessage( { sessionId: 'a', role: 'user', content: 'session-a' } )
        await store.addMessage( { sessionId: 'b', role: 'user', content: 'session-b' } )

        const { contextPrefix: ctxA } = await store.getContext( { sessionId: 'a' } )
        const { contextPrefix: ctxB } = await store.getContext( { sessionId: 'b' } )

        expect( ctxA ).toContain( 'session-a' )
        expect( ctxA ).not.toContain( 'session-b' )
        expect( ctxB ).toContain( 'session-b' )
        expect( ctxB ).not.toContain( 'session-a' )
    } )


    it( 'cleanup removes expired sessions', async () => {
        const backend = new InMemorySessionStore()
        const { store: ttlStore } = SessionStore.create( { backend, ttlMs: 1000 } )

        // Manually set a session with old lastActivity
        const oldContext: ConversationContext = {
            sessionId: 'old-sess',
            messages: [ { role: 'user', content: 'old', timestamp: new Date( Date.now() - 5000 ).toISOString() } ],
            createdAt: new Date( Date.now() - 5000 ).toISOString(),
            lastActivity: new Date( Date.now() - 5000 ).toISOString()
        }

        await backend.set( { sessionId: 'old-sess', context: oldContext } )

        // Add a fresh session through the store
        await ttlStore.addMessage( { sessionId: 'fresh-sess', role: 'user', content: 'new' } )

        // Run cleanup
        const removed = await backend.cleanup( { ttlMs: 1000 } )

        expect( removed ).toBe( 1 )

        const old = await backend.get( { sessionId: 'old-sess' } )
        const fresh = await backend.get( { sessionId: 'fresh-sess' } )

        expect( old ).toBeNull()
        expect( fresh ).not.toBeNull()
    } )


    it( 'cleanup preserves non-expired sessions', async () => {
        const backend = new InMemorySessionStore()
        const { store: ttlStore } = SessionStore.create( { backend, ttlMs: 60000 } )

        await ttlStore.addMessage( { sessionId: 'active', role: 'user', content: 'hello' } )

        const removed = await backend.cleanup( { ttlMs: 60000 } )

        expect( removed ).toBe( 0 )

        const active = await backend.get( { sessionId: 'active' } )

        expect( active ).not.toBeNull()
    } )


    it( 'startCleanup and stopCleanup manage the interval', () => {
        const spy = vi.spyOn( global, 'setInterval' )
        const clearSpy = vi.spyOn( global, 'clearInterval' )

        store.startCleanup( { intervalMs: 5000 } )

        expect( spy ).toHaveBeenCalledWith( expect.any( Function ), 5000 )

        store.stopCleanup()

        expect( clearSpy ).toHaveBeenCalled()

        spy.mockRestore()
        clearSpy.mockRestore()
    } )
} )


describe( 'InMemorySessionStore', () => {

    let backend: InMemorySessionStore


    beforeEach( () => {
        backend = new InMemorySessionStore()
    } )


    it( 'get returns null for unknown session', async () => {
        const result = await backend.get( { sessionId: 'unknown' } )

        expect( result ).toBeNull()
    } )


    it( 'set and get round-trip correctly', async () => {
        const context: ConversationContext = {
            sessionId: 'test-1',
            messages: [ { role: 'user', content: 'hi', timestamp: new Date().toISOString() } ],
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString()
        }

        await backend.set( { sessionId: 'test-1', context } )

        const result = await backend.get( { sessionId: 'test-1' } )

        expect( result ).toEqual( context )
    } )


    it( 'has returns false for unknown session', async () => {
        const result = await backend.has( { sessionId: 'nope' } )

        expect( result ).toBe( false )
    } )


    it( 'has returns true for existing session', async () => {
        const context: ConversationContext = {
            sessionId: 'exists',
            messages: [],
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString()
        }

        await backend.set( { sessionId: 'exists', context } )

        const result = await backend.has( { sessionId: 'exists' } )

        expect( result ).toBe( true )
    } )


    it( 'delete removes a session', async () => {
        const context: ConversationContext = {
            sessionId: 'del-me',
            messages: [],
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString()
        }

        await backend.set( { sessionId: 'del-me', context } )
        await backend.delete( { sessionId: 'del-me' } )

        const result = await backend.get( { sessionId: 'del-me' } )

        expect( result ).toBeNull()
    } )


    it( 'cleanup removes expired sessions and returns count', async () => {
        const old: ConversationContext = {
            sessionId: 'expired',
            messages: [],
            createdAt: new Date( Date.now() - 7200000 ).toISOString(),
            lastActivity: new Date( Date.now() - 7200000 ).toISOString()
        }

        const fresh: ConversationContext = {
            sessionId: 'active',
            messages: [],
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString()
        }

        await backend.set( { sessionId: 'expired', context: old } )
        await backend.set( { sessionId: 'active', context: fresh } )

        const removed = await backend.cleanup( { ttlMs: 3600000 } )

        expect( removed ).toBe( 1 )

        const expiredResult = await backend.get( { sessionId: 'expired' } )
        const activeResult = await backend.get( { sessionId: 'active' } )

        expect( expiredResult ).toBeNull()
        expect( activeResult ).not.toBeNull()
    } )


    it( 'cleanup returns 0 when no sessions expired', async () => {
        const context: ConversationContext = {
            sessionId: 'still-good',
            messages: [],
            createdAt: new Date().toISOString(),
            lastActivity: new Date().toISOString()
        }

        await backend.set( { sessionId: 'still-good', context } )

        const removed = await backend.cleanup( { ttlMs: 3600000 } )

        expect( removed ).toBe( 0 )
    } )
} )
