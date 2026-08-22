import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/index.js';

const EXAMPLE = new URL('../../../examples/first-game', import.meta.url).pathname;

async function connect(): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverSide);
  const client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientSide);
  return client;
}

/**
 * The protocol layer is thin on purpose, so these tests only check that it is
 * wired up: the tools are announced, they describe themselves, and the schemas
 * they publish are the project's own.
 */
describe('the MCP server', () => {
  it('announces every tool with a description', async () => {
    const { tools } = await (await connect()).listTools();
    const names = tools.map((tool) => tool.name).sort();

    expect(names).toEqual([
      'add_asset',
      'add_rule',
      'add_variable',
      'create_entity',
      'create_project',
      'create_scene',
      'describe_project',
      'desktop_project',
      'export_project',
      'list_rule_types',
      'modify_entity',
      'move_entity',
      'open_project',
      'paint_tiles',
      'place_entity',
      'read_scene',
      'remove_entity',
      'remove_rule',
      'validate_project',
    ]);
    for (const tool of tools) {
      expect(tool.description?.length ?? 0).toBeGreaterThan(20);
    }
  });

  it('publishes the project schema itself as the shape of a rule', async () => {
    const { tools } = await (await connect()).listTools();
    const addRule = tools.find((tool) => tool.name === 'add_rule');
    const rule = addRule?.inputSchema.properties?.rule as { properties?: Record<string, unknown> };

    // WHEN, IF and THEN, straight out of packages/schema.
    expect(Object.keys(rule.properties ?? {})).toEqual(
      expect.arrayContaining(['id', 'when', 'if', 'then']),
    );
  });

  it('opens a project and answers with a summary', async () => {
    const client = await connect();
    const result = await client.callTool({ name: 'open_project', arguments: { path: EXAMPLE } });
    const [first] = result.content as { type: string; text: string }[];

    expect(first?.text).toContain('Coin Run');
  });

  it('turns a broken request into a readable answer rather than a crash', async () => {
    const client = await connect();
    await client.callTool({ name: 'open_project', arguments: { path: EXAMPLE } });
    const result = await client.callTool({
      name: 'read_scene',
      arguments: { scene: 'level-nine' },
    });

    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain('no level called');
  });

  it('rejects an argument the project schema would not accept', async () => {
    const client = await connect();
    await client.callTool({ name: 'open_project', arguments: { path: EXAMPLE } });
    const result = await client.callTool({
      name: 'add_rule',
      arguments: { rule: { id: 'nope', when: { type: 'when-pigs-fly' }, then: [] } },
    });

    expect(result.isError).toBe(true);
  });
});
