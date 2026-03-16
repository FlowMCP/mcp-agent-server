import { describe, test, expect, vi } from 'vitest'


const mockCreateTask = vi.fn()
const mockGetTask = vi.fn()
const mockGetTaskResult = vi.fn()
const mockStoreTaskResult = vi.fn()

vi.mock( '@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js', () => {
    return {
        InMemoryTaskStore: class MockTaskStore {
            createTask: ReturnType<typeof vi.fn>
            getTask: ReturnType<typeof vi.fn>
            getTaskResult: ReturnType<typeof vi.fn>
            storeTaskResult: ReturnType<typeof vi.fn>

            constructor() {
                this.createTask = mockCreateTask
                this.getTask = mockGetTask
                this.getTaskResult = mockGetTaskResult
                this.storeTaskResult = mockStoreTaskResult
            }
        }
    }
} )

vi.mock( '@modelcontextprotocol/sdk/experimental/tasks/interfaces.js', () => {
    return {
        isTerminal: vi.fn( ( status: string ) => status === 'completed' || status === 'failed' || status === 'cancelled' )
    }
} )

import { TaskManager } from '../../src/task/TaskManager.js'


describe( 'TaskManager', () => {
    describe( 'constructor', () => {
        test( 'creates with default InMemoryTaskStore when no store provided', () => {
            const manager = new TaskManager( {} )

            expect( manager ).toBeDefined()
            expect( manager.taskStore ).toBeDefined()
        } )


        test( 'uses custom store when provided', () => {
            const customStore = { createTask: vi.fn(), getTask: vi.fn() }
            const manager = new TaskManager( { taskStore: customStore } )

            expect( manager.taskStore ).toBe( customStore )
        } )
    } )


    describe( 'createTask', () => {
        test( 'delegates to task store with correct parameters', async () => {
            const mockTask = { taskId: 'task-123', status: 'pending' }
            mockCreateTask.mockResolvedValueOnce( mockTask )

            const manager = new TaskManager( {} )

            const { task } = await manager.createTask( {
                requestId: 'req-1',
                request: { params: { name: 'test-tool' } },
                sessionId: 'sess-1',
                taskParams: { ttl: 30000, pollInterval: 2000 }
            } )

            expect( task ).toEqual( mockTask )
            expect( mockCreateTask ).toHaveBeenCalledWith(
                { ttl: 30000, pollInterval: 2000 },
                'req-1',
                { params: { name: 'test-tool' } },
                'sess-1'
            )
        } )


        test( 'defaults pollInterval to 1000 when not specified', async () => {
            mockCreateTask.mockReset()
            mockCreateTask.mockResolvedValueOnce( { taskId: 'task-456', status: 'pending' } )

            const manager = new TaskManager( {} )

            await manager.createTask( {
                requestId: 'req-2',
                request: {},
                sessionId: 'sess-2',
                taskParams: { ttl: 60000 }
            } )

            const callArgs = mockCreateTask.mock.calls[ 0 ][ 0 ]

            expect( callArgs.pollInterval ).toBe( 1000 )
        } )
    } )


    describe( 'completeTask', () => {
        test( 'stores completed result in task store', async () => {
            mockStoreTaskResult.mockReset()
            mockStoreTaskResult.mockResolvedValueOnce( undefined )

            const manager = new TaskManager( {} )
            const taskResult = {
                content: [ { type: 'text', text: '{"status": "success"}' } ]
            }

            await manager.completeTask( { taskId: 'task-789', result: taskResult } )

            expect( mockStoreTaskResult ).toHaveBeenCalledWith(
                'task-789',
                'completed',
                taskResult
            )
        } )


        test( 'notifies waiting resolvers', async () => {
            mockStoreTaskResult.mockReset()
            mockStoreTaskResult.mockResolvedValue( undefined )
            mockGetTask.mockReset()
            mockGetTask.mockResolvedValue( { taskId: 'task-wait', status: 'pending' } )
            mockGetTaskResult.mockReset()
            mockGetTaskResult.mockResolvedValue( { content: [ { type: 'text', text: 'done' } ] } )

            const manager = new TaskManager( {} )

            let resolved = false
            const waitPromise = manager.getTaskResult( { taskId: 'task-wait' } )
                .then( () => {
                    resolved = true
                } )

            // Allow getTaskResult to reach #waitForComplete before calling completeTask
            await new Promise( ( resolve ) => setTimeout( resolve, 50 ) )

            await manager.completeTask( {
                taskId: 'task-wait',
                result: { content: [ { type: 'text', text: 'done' } ] }
            } )

            await waitPromise

            expect( resolved ).toBe( true )
        } )
    } )


    describe( 'failTask', () => {
        test( 'stores failed result in task store', async () => {
            mockStoreTaskResult.mockReset()
            mockStoreTaskResult.mockResolvedValueOnce( undefined )

            const manager = new TaskManager( {} )

            await manager.failTask( {
                taskId: 'task-fail',
                error: new Error( 'LLM crashed' )
            } )

            expect( mockStoreTaskResult ).toHaveBeenCalledWith(
                'task-fail',
                'failed',
                expect.objectContaining( {
                    isError: true,
                    content: expect.arrayContaining( [
                        expect.objectContaining( { type: 'text' } )
                    ] )
                } )
            )

            const storedResult = mockStoreTaskResult.mock.calls[ 0 ][ 2 ]
            const parsed = JSON.parse( storedResult.content[ 0 ].text )

            expect( parsed.status ).toBe( 'error' )
            expect( parsed.error ).toBe( 'LLM crashed' )
        } )
    } )


    describe( 'getTask', () => {
        test( 'returns task from store', async () => {
            mockGetTask.mockReset()
            const mockTask = { taskId: 'task-get', status: 'completed' }
            mockGetTask.mockResolvedValueOnce( mockTask )

            const manager = new TaskManager( {} )

            const { task } = await manager.getTask( { taskId: 'task-get' } )

            expect( task ).toEqual( mockTask )
        } )


        test( 'returns null for non-existent task', async () => {
            mockGetTask.mockReset()
            mockGetTask.mockResolvedValueOnce( null )

            const manager = new TaskManager( {} )

            const { task } = await manager.getTask( { taskId: 'nonexistent' } )

            expect( task ).toBeNull()
        } )
    } )


    describe( 'getTaskResult', () => {
        test( 'returns result immediately for terminal tasks', async () => {
            mockGetTask.mockReset()
            mockGetTaskResult.mockReset()

            mockGetTask.mockResolvedValueOnce( { taskId: 'task-done', status: 'completed' } )
            mockGetTaskResult.mockResolvedValueOnce( {
                content: [ { type: 'text', text: '{"data": "result"}' } ]
            } )

            const manager = new TaskManager( {} )

            const result = await manager.getTaskResult( { taskId: 'task-done' } )

            expect( result.content[ 0 ].text ).toContain( 'result' )
        } )


        test( 'throws for non-existent task', async () => {
            mockGetTask.mockReset()
            mockGetTask.mockResolvedValueOnce( null )

            const manager = new TaskManager( {} )

            await expect(
                manager.getTaskResult( { taskId: 'nonexistent' } )
            ).rejects.toThrow( 'Task nonexistent not found' )
        } )
    } )
} )
