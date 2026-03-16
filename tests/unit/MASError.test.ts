import { describe, it, expect } from 'vitest'

import { MASError, MAS_ERROR_CODES } from '../../src/errors/MASError.js'


describe( 'MASError', () => {

    it( 'creates error with code and message', () => {
        const error = new MASError( {
            code: MAS_ERROR_CODES.ENV_MISSING,
            message: 'LLM_BASE_URL is required'
        } )

        expect( error ).toBeInstanceOf( Error )
        expect( error ).toBeInstanceOf( MASError )
        expect( error.name ).toBe( 'MASError' )
        expect( error.code ).toBe( 'MAS_ENV_MISSING' )
        expect( error.message ).toBe( 'LLM_BASE_URL is required' )
        expect( error.details ).toBeUndefined()
    } )


    it( 'creates error with details', () => {
        const error = new MASError( {
            code: MAS_ERROR_CODES.MANIFEST_MISSING_FIELD,
            message: 'Field "name" is missing',
            details: { field: 'name', manifest: 'agent.mjs' }
        } )

        expect( error.code ).toBe( 'MAS_MANIFEST_MISSING_FIELD' )
        expect( error.details ).toEqual( { field: 'name', manifest: 'agent.mjs' } )
    } )


    it( 'has correct stack trace', () => {
        const error = new MASError( {
            code: MAS_ERROR_CODES.TOOL_NOT_FOUND,
            message: 'Tool "xyz" not found'
        } )

        expect( error.stack ).toBeDefined()
        expect( error.stack ).toContain( 'MASError' )
    } )

} )


describe( 'MAS_ERROR_CODES', () => {

    it( 'has all 15 error codes', () => {
        const codes = Object.values( MAS_ERROR_CODES )

        expect( codes ).toHaveLength( 15 )
    } )


    it( 'all codes start with MAS_', () => {
        Object.values( MAS_ERROR_CODES )
            .forEach( ( code ) => {
                expect( code ).toMatch( /^MAS_/ )
            } )
    } )


    it( 'has expected codes', () => {
        expect( MAS_ERROR_CODES.ENV_MISSING ).toBe( 'MAS_ENV_MISSING' )
        expect( MAS_ERROR_CODES.SCHEMA_VERSION ).toBe( 'MAS_SCHEMA_VERSION' )
        expect( MAS_ERROR_CODES.LLM_CONFIG_MISSING ).toBe( 'MAS_LLM_CONFIG_MISSING' )
        expect( MAS_ERROR_CODES.TOOL_NOT_FOUND ).toBe( 'MAS_TOOL_NOT_FOUND' )
        expect( MAS_ERROR_CODES.AGENT_MAX_ROUNDS ).toBe( 'MAS_AGENT_MAX_ROUNDS' )
        expect( MAS_ERROR_CODES.TASK_TERMINAL ).toBe( 'MAS_TASK_TERMINAL' )
    } )

} )
