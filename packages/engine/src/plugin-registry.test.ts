import { describe, expect, it, vi } from 'vitest';
import { DefaultPluginRegistry } from './plugin-registry.js';
import { SeoPlugin, Rule, Finding } from '@seocore/sdk';

class MockRule implements Rule {
  constructor(public id: string, public category: string) {}
  get definition() {
    return {
      id: this.id,
      name: this.id,
      description: '',
      category: this.category,
      defaultSeverity: 'info' as const,
      defaultWeight: 1,
    };
  }
  async evaluate() {
    return [];
  }
}

describe('DefaultPluginRegistry', () => {
  it('register + getRules aggregates across plugins', () => {
    const reg = new DefaultPluginRegistry();
    const rule1 = new MockRule('rule1', 'seo');
    const rule2 = new MockRule('rule2', 'performance');

    const plugin1: SeoPlugin = { name: 'p1', version: '1', rules: [rule1] };
    const plugin2: SeoPlugin = { name: 'p2', version: '1', rules: [rule2] };

    reg.register(plugin1);
    reg.register(plugin2);

    const rules = reg.getRules();
    expect(rules).toHaveLength(2);
    expect(rules).toContain(rule1);
    expect(rules).toContain(rule2);
  });

  it("runHook invokes every plugin's handler with multiple arguments", async () => {
    const reg = new DefaultPluginRegistry();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const plugin1: SeoPlugin = { name: 'p1', version: '1', lifecycle: { onInit: handler1 } };
    const plugin2: SeoPlugin = { name: 'p2', version: '1', lifecycle: { onInit: handler2 } };

    reg.register(plugin1);
    reg.register(plugin2);

    await reg.runHook('onInit', { some: 'config' });

    expect(handler1).toHaveBeenCalledWith({ some: 'config' });
    expect(handler2).toHaveBeenCalledWith({ some: 'config' });
  });

  it('runMutationHook chains return values through plugins', async () => {
    const reg = new DefaultPluginRegistry();
    const handler1 = vi.fn().mockImplementation((findings: Finding[]) => {
      return [...findings, { id: 'added1' } as Finding];
    });
    const handler2 = vi.fn().mockImplementation((findings: Finding[]) => {
      return [...findings, { id: 'added2' } as Finding];
    });

    const plugin1: SeoPlugin = { name: 'p1', version: '1', lifecycle: { onAfterAnalysis: handler1 } };
    const plugin2: SeoPlugin = { name: 'p2', version: '1', lifecycle: { onAfterAnalysis: handler2 } };

    reg.register(plugin1);
    reg.register(plugin2);

    const initial: Finding[] = [{ id: 'init' } as Finding];
    const result = await reg.runMutationHook('onAfterAnalysis', initial);

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('init');
    expect(result[1].id).toBe('added1');
    expect(result[2].id).toBe('added2');
  });

  it("hook error in one plugin doesn't abort the chain", async () => {
    const reg = new DefaultPluginRegistry();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler1 = vi.fn().mockRejectedValue(new Error('crash'));
    const handler2 = vi.fn();

    const plugin1: SeoPlugin = { name: 'p1', version: '1', lifecycle: { onInit: handler1 } };
    const plugin2: SeoPlugin = { name: 'p2', version: '1', lifecycle: { onInit: handler2 } };

    reg.register(plugin1);
    reg.register(plugin2);

    await reg.runHook('onInit', {});

    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
