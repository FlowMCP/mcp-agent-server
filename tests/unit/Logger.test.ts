import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { Logger } from '../../src/logging/Logger.js'


describe( 'Logger', () => {

    let logSpy: any
    let errorSpy: any

    beforeEach( () => {
        logSpy = vi.spyOn( console, 'log' ).mockImplementation( () => {} )
        errorSpy = vi.spyOn( console, 'error' ).mockImplementation( () => {} )
        Logger.level = 'debug'
    } )

    afterEach( () => {
        vi.restoreAllMocks()
    } )


    it( 'outputs debug messages when level is debug', () => {
        Logger.debug( 'TestComponent', 'debug message' )

        expect( logSpy ).toHaveBeenCalledTimes( 1 )
        expect( logSpy.mock.calls[ 0 ][ 0 ] ).toMatch( /\[DEBUG\] \[TestComponent\] debug message/ )
    } )


    it( 'outputs info messages', () => {
        Logger.info( 'AgentLoop', 'Round 1' )

        expect( logSpy ).toHaveBeenCalledTimes( 1 )
        expect( logSpy.mock.calls[ 0 ][ 0 ] ).toMatch( /\[INFO\] \[AgentLoop\] Round 1/ )
    } )


    it( 'outputs warn messages', () => {
        Logger.warn( 'ToolRegistry', 'Unknown type' )

        expect( logSpy ).toHaveBeenCalledTimes( 1 )
        expect( logSpy.mock.calls[ 0 ][ 0 ] ).toMatch( /\[WARN\] \[ToolRegistry\] Unknown type/ )
    } )


    it( 'outputs error messages to stderr', () => {
        Logger.error( 'AgentServer', 'Connection failed' )

        expect( errorSpy ).toHaveBeenCalledTimes( 1 )
        expect( errorSpy.mock.calls[ 0 ][ 0 ] ).toMatch( /\[ERROR\] \[AgentServer\] Connection failed/ )
    } )


    it( 'includes ISO timestamp in output', () => {
        Logger.info( 'Test', 'timestamp check' )

        const output = logSpy.mock.calls[ 0 ][ 0 ]

        expect( output ).toMatch( /^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/ )
    } )


    it( 'appends data as JSON when provided', () => {
        Logger.info( 'Test', 'with data', { key: 'value' } )

        const output = logSpy.mock.calls[ 0 ][ 0 ]

        expect( output ).toContain( '{"key":"value"}' )
    } )


    it( 'suppresses debug messages when level is info', () => {
        Logger.level = 'info'
        Logger.debug( 'Test', 'should not appear' )

        expect( logSpy ).not.toHaveBeenCalled()
    } )


    it( 'suppresses info messages when level is warn', () => {
        Logger.level = 'warn'
        Logger.info( 'Test', 'should not appear' )

        expect( logSpy ).not.toHaveBeenCalled()
    } )


    it( 'suppresses warn messages when level is error', () => {
        Logger.level = 'error'
        Logger.warn( 'Test', 'should not appear' )

        expect( logSpy ).not.toHaveBeenCalled()
    } )


    it( 'always shows error messages regardless of level', () => {
        Logger.level = 'error'
        Logger.error( 'Test', 'always visible' )

        expect( errorSpy ).toHaveBeenCalledTimes( 1 )
    } )


    it( 'accepts string data without JSON wrapping', () => {
        Logger.info( 'Test', 'message', 'plain string' )

        const output = logSpy.mock.calls[ 0 ][ 0 ]

        expect( output ).toContain( '| plain string' )
    } )
} )
