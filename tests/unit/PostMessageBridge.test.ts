import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'

import { PostMessageBridge } from '../../src/ui/PostMessageBridge.js'


describe( 'PostMessageBridge', () => {

    let emitter: EventEmitter

    beforeEach( () => {
        emitter = new EventEmitter()
        vi.spyOn( console, 'log' ).mockImplementation( () => {} )
        vi.spyOn( console, 'error' ).mockImplementation( () => {} )
    } )

    afterEach( () => {
        vi.restoreAllMocks()
    } )


    test( 'create returns bridge instance', () => {
        const { bridge } = PostMessageBridge.create( { emitter } )

        expect( bridge ).toBeInstanceOf( PostMessageBridge )
    } )


    test( 'eventCount starts at 0', () => {
        const { bridge } = PostMessageBridge.create( { emitter } )

        expect( bridge.eventCount ).toBe( 0 )
    } )


    test( 'forwards agent:start events', () => {
        const { bridge } = PostMessageBridge.create( { emitter } )
        const events: any[] = []

        bridge.start( { onEvent: ( e ) => events.push( e ) } )

        emitter.emit( 'agent:start', { taskId: 'task-1' } )

        expect( events ).toHaveLength( 1 )
        expect( events[ 0 ].type ).toBe( 'agent:start' )
        expect( events[ 0 ].payload.taskId ).toBe( 'task-1' )
        expect( events[ 0 ].timestamp ).toBeGreaterThan( 0 )
    } )


    test( 'forwards agent:status events', () => {
        const { bridge } = PostMessageBridge.create( { emitter } )
        const events: any[] = []

        bridge.start( { onEvent: ( e ) => events.push( e ) } )

        emitter.emit( 'agent:status', { round: 1, message: 'Calling tool' } )

        expect( events ).toHaveLength( 1 )
        expect( events[ 0 ].type ).toBe( 'agent:status' )
        expect( events[ 0 ].payload.round ).toBe( 1 )
    } )


    test( 'forwards agent:complete events', () => {
        const { bridge } = PostMessageBridge.create( { emitter } )
        const events: any[] = []

        bridge.start( { onEvent: ( e ) => events.push( e ) } )

        emitter.emit( 'agent:complete', { result: { answer: 'done' } } )

        expect( events ).toHaveLength( 1 )
        expect( events[ 0 ].type ).toBe( 'agent:complete' )
    } )


    test( 'forwards agent:error events', () => {
        const { bridge } = PostMessageBridge.create( { emitter } )
        const events: any[] = []

        bridge.start( { onEvent: ( e ) => events.push( e ) } )

        emitter.emit( 'agent:error', { error: 'Something failed' } )

        expect( events ).toHaveLength( 1 )
        expect( events[ 0 ].type ).toBe( 'agent:error' )
        expect( events[ 0 ].payload.error ).toBe( 'Something failed' )
    } )


    test( 'increments eventCount for each event', () => {
        const { bridge } = PostMessageBridge.create( { emitter } )

        bridge.start( { onEvent: () => {} } )

        emitter.emit( 'agent:start', {} )
        emitter.emit( 'agent:status', {} )
        emitter.emit( 'agent:complete', {} )

        expect( bridge.eventCount ).toBe( 3 )
    } )


    test( 'stop removes all listeners', () => {
        const { bridge } = PostMessageBridge.create( { emitter } )
        const events: any[] = []

        bridge.start( { onEvent: ( e ) => events.push( e ) } )
        bridge.stop()

        emitter.emit( 'agent:start', {} )

        expect( events ).toHaveLength( 0 )
        expect( emitter.listenerCount( 'agent:start' ) ).toBe( 0 )
    } )


    test( 'handles onEvent errors gracefully', () => {
        const { bridge } = PostMessageBridge.create( { emitter } )

        bridge.start( {
            onEvent: () => {
                throw new Error( 'callback failed' )
            }
        } )

        expect( () => {
            emitter.emit( 'agent:start', {} )
        } ).not.toThrow()

        expect( bridge.eventCount ).toBe( 1 )
    } )


    test( 'ignores unrelated events', () => {
        const { bridge } = PostMessageBridge.create( { emitter } )
        const events: any[] = []

        bridge.start( { onEvent: ( e ) => events.push( e ) } )

        emitter.emit( 'unrelated:event', {} )

        expect( events ).toHaveLength( 0 )
        expect( bridge.eventCount ).toBe( 0 )
    } )
} )
