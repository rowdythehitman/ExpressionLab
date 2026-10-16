// A small fake of the After Effects scripting DOM, enough to run cep/host/host.jsx in Node.
import { readFileSync } from 'node:fs';
import { createContext, runInContext, type Context } from 'node:vm';

export const HOST_JSX = readFileSync(new URL('../../cep/host/host.jsx', import.meta.url), 'utf8');

const PropertyValueType = {
  NO_VALUE: 6412, OneD: 6417, TwoD: 6418, TwoD_SPATIAL: 6419, ThreeD: 6414, ThreeD_SPATIAL: 6415,
  COLOR: 6416, SHAPE: 6421, TEXT_DOCUMENT: 6420, CUSTOM_VALUE: 6413, MARKER: 6422, LAYER_INDEX: 6423, MASK_INDEX: 6424,
} as const;
const PropertyType = { PROPERTY: 6812, INDEXED_GROUP: 6813, NAMED_GROUP: 6814 } as const;

export interface FakeProp {
  name: string;
  matchName: string;
  propertyType: number;
  propertyValueType?: number;
  canSetExpression: boolean;
  expression: string;
  expressionEnabled: boolean;
  expressionError: string;
  propertyDepth: number;
  propertyGroup(n: number): { name: string; matchName: string; [k: string]: unknown };
}

export interface FakeLayerSpec {
  name: string;
  index?: number;
  threeD?: boolean;
  text?: boolean;
}

export function makeAE() {
  class CompItem {
    name = 'Main Comp';
    selectedProperties: FakeProp[] = [];
    selectedLayers: FakeLayer[] = [];
    all: FakeLayer[] = [];
    get numLayers() { return this.all.length; }
    layer(i: number) { return this.all[i - 1]!; }
    layers = {
      addNull: () => {
        const l = new FakeLayer('Null 1');
        this.all.unshift(l);
        return l;
      },
    };
  }
  /** A layer with an Effects group, for the setup script. */
  class FakeLayer {
    threeDLayer = false;
    effects: Array<{ name: string; matchName: string; value?: unknown; items?: string[] }> = [];
    constructor(public name: string) {}
    property(matchName: string) {
      if (matchName !== 'ADBE Effect Parade') throw new Error(`no ${matchName}`);
      return {
        property: (name: string) => this.effects.find((e) => e.name === name) ?? null,
        addProperty: (m: string) => {
          const fx: { name: string; matchName: string; value?: unknown; items?: string[]; property(i: number): unknown } = {
            name: m, matchName: m,
            property: () => ({ setValue: (v: unknown) => { fx.value = v; }, setPropertyParameters: (items: string[]) => { fx.items = items; } }),
          };
          this.effects.push(fx);
          return fx;
        },
      };
    }
  }
  class AVLayer {}
  class TextLayer extends AVLayer {}
  const log: string[] = [];
  const app = {
    project: { activeItem: null as unknown },
    beginUndoGroup: (n: string) => log.push(`begin:${n}`),
    endUndoGroup: () => log.push('end'),
  };
  const comp = new CompItem();
  const ctx: Context = createContext({ app, CompItem, TextLayer, PropertyType, PropertyValueType });
  runInContext(HOST_JSX, ctx);

  /** A property under `groups` (match names, outermost first) on a layer. */
  const prop = (
    layer: FakeLayerSpec,
    name: string,
    matchName: string,
    valueType: keyof typeof PropertyValueType,
    groups: string[] = [],
    extra: Partial<FakeProp> = {},
  ): FakeProp => {
    const layerObj = Object.assign(layer.text ? new TextLayer() : new AVLayer(), {
      name: layer.name, index: layer.index ?? 1, threeDLayer: !!layer.threeD, matchName: 'ADBE AV Layer',
    }) as unknown as { name: string; matchName: string };
    // propertyGroup(1) is the parent; propertyGroup(depth) is the layer.
    const chain = [...groups].reverse().map((m) => ({ name: m, matchName: m }));
    const depth = chain.length + 1;
    return {
      name, matchName,
      propertyType: PropertyType.PROPERTY,
      propertyValueType: PropertyValueType[valueType],
      canSetExpression: true,
      expression: '', expressionEnabled: false, expressionError: '',
      propertyDepth: depth,
      propertyGroup: (n) => (n >= depth ? layerObj : chain[n - 1]!),
      ...extra,
    };
  };

  return {
    app, comp, log, prop,
    addLayer(name: string) { const l = new FakeLayer(name); comp.all.push(l); return l; },
    openComp() { app.project.activeItem = comp; },
    evalScript: async (src: string) => String(runInContext(src, ctx)),
  };
}
