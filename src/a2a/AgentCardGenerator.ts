class AgentCardGenerator {
    static generate( { manifest, serverUrl }: { manifest: Record<string, any>, serverUrl: string } ) {
        const { name, description } = manifest

        const skills = AgentCardGenerator.#buildSkills( { manifest } )

        const agentCard = {
            protocolVersion: '0.3.0',
            name,
            description,
            url: `${serverUrl}/a2a/v1`,
            capabilities: { streaming: false },
            defaultInputModes: [ 'application/json', 'text/plain' ],
            defaultOutputModes: [ 'application/json', 'text/plain' ],
            skills
        }

        return { agentCard }
    }


    static #buildSkills( { manifest }: { manifest: Record<string, any> } ) {
        const { name, description, inputSchema, skills: manifestSkills } = manifest
        const result: any[] = []

        const defaultSkill = {
            id: name,
            name,
            description,
            inputSchema: inputSchema || {
                type: 'object',
                properties: {
                    query: { type: 'string', description: 'Input query' }
                },
                required: [ 'query' ]
            }
        }

        result.push( defaultSkill )

        if( manifestSkills && typeof manifestSkills === 'object' ) {
            Object.entries( manifestSkills )
                .forEach( ( [ skillName, skillDef ] ) => {
                    const hasSlash = skillName.includes( '/' )

                    if( !hasSlash && skillDef !== null ) {
                        result.push( {
                            id: skillName,
                            name: skillName,
                            description: `Skill: ${skillName}`
                        } )
                    }
                } )
        }

        return result
    }
}


export { AgentCardGenerator }
