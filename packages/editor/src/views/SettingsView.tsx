import type { VariableDefinition } from '@pinforge/schema';
import * as edit from '../state/commands.js';
import { useEditor, useEditorState } from '../state/useStore.js';
import {
  Button,
  Checkbox,
  Field,
  Note,
  NumberInput,
  Panel,
  Select,
  TextInput,
} from '../ui/controls.js';
import { nextId } from '../panels/Sidebar.js';

export function SettingsView() {
  const store = useEditor();
  const state = useEditorState();
  const project = state.project;

  return (
    <div className="column" style={{ maxWidth: 760, margin: '0 auto', width: '100%' }}>
      <Panel title="The game">
        <Field label="Name">
          <TextInput
            value={project.meta.name}
            onChange={(name) => store.apply(edit.setProjectName(name))}
          />
        </Field>
        <Field label="Made by">
          <TextInput
            value={project.meta.author}
            onChange={(author) => store.apply(edit.setProjectMeta({ author }))}
          />
        </Field>
        <Field label="What it is">
          <TextInput
            value={project.meta.description}
            onChange={(description) => store.apply(edit.setProjectMeta({ description }))}
          />
        </Field>
        <Field label="Starts on">
          <Select
            value={project.settings.startScene}
            onChange={(startScene) => store.apply(edit.setSettings({ startScene }))}
            choices={project.scenes.map((one) => ({ value: one.id, label: one.name ?? one.id }))}
          />
        </Field>
      </Panel>

      <Panel title="The picture">
        <div className="pair">
          <Field
            label="Width in pixels"
            hint="The game is drawn at this size and then scaled up to the window."
          >
            <NumberInput
              min={16}
              value={project.settings.viewport.width}
              onChange={(width) =>
                store.apply(edit.setSettings({ viewport: { ...project.settings.viewport, width } }))
              }
            />
          </Field>
          <Field label="Height in pixels">
            <NumberInput
              min={16}
              value={project.settings.viewport.height}
              onChange={(height) =>
                store.apply(
                  edit.setSettings({ viewport: { ...project.settings.viewport, height } }),
                )
              }
            />
          </Field>
        </div>
        <Field
          label="Scaling"
          hint="Whole numbers keep pixel art sharp. Fit allows any size and adds bars. Stretch ignores the shape of the window."
        >
          <Select
            value={project.settings.viewport.scaleMode}
            onChange={(scaleMode) =>
              store.apply(
                edit.setSettings({
                  viewport: {
                    ...project.settings.viewport,
                    scaleMode: scaleMode as 'integer' | 'fit' | 'stretch',
                  },
                }),
              )
            }
            choices={[
              { value: 'integer', label: 'Whole numbers only' },
              { value: 'fit', label: 'Fit the window' },
              { value: 'stretch', label: 'Stretch to fill' },
            ]}
          />
        </Field>
        <Checkbox
          label="Keep pixel art sharp"
          checked={project.settings.pixelArt}
          onChange={(pixelArt) => store.apply(edit.setSettings({ pixelArt }))}
          hint="Turn this off for smooth, hand drawn art."
        />
      </Panel>

      <Panel title="Controls">
        <Note>
          Rules talk about these names, never about keys, so changing a key here changes it
          everywhere. Use key names such as ArrowLeft, KeyA or Space, separated by commas.
        </Note>
        {Object.entries(project.settings.input).map(([action, keys]) => (
          <Field key={action} label={action}>
            <TextInput
              value={keys.join(', ')}
              onChange={(raw) =>
                store.apply(
                  edit.setInputAction(
                    action,
                    raw
                      .split(',')
                      .map((one) => one.trim())
                      .filter(Boolean),
                  ),
                )
              }
            />
          </Field>
        ))}
      </Panel>

      <Panel
        title="Things the game remembers"
        action={
          <Button
            small
            kind="quiet"
            onClick={() =>
              store.apply(
                edit.addVariable({
                  id: nextId(
                    project.variables.map((one) => one.id),
                    'value',
                  ),
                  name: 'New value',
                  type: 'number',
                  initial: 0,
                }),
              )
            }
          >
            Add
          </Button>
        }
      >
        <Note>A score, a number of lives, whether a key has been found.</Note>
        {project.variables.map((variable) => (
          <div key={variable.id} className="panel plain" style={{ marginTop: 10 }}>
            <div className="pair">
              <Field label="Name">
                <TextInput
                  value={variable.name ?? ''}
                  onChange={(name) =>
                    store.apply(edit.updateVariable({ ...variable, name: name || undefined }))
                  }
                />
              </Field>
              <Field label="Kind">
                <Select
                  value={variable.type}
                  onChange={(type) => store.apply(edit.updateVariable(retyped(variable, type)))}
                  choices={[
                    { value: 'number', label: 'A number' },
                    { value: 'boolean', label: 'Yes or no' },
                    { value: 'text', label: 'Some words' },
                  ]}
                />
              </Field>
            </div>
            <Field label="Starts at">
              <TextInput
                value={String(variable.initial)}
                onChange={(raw) => store.apply(edit.updateVariable(withInitial(variable, raw)))}
              />
            </Field>
            <div className="note">
              <code>{variable.id}</code>
            </div>
            <Button
              small
              kind="danger"
              onClick={() => store.apply(edit.removeVariable(variable.id))}
            >
              Remove
            </Button>
          </div>
        ))}
      </Panel>
    </div>
  );
}

function retyped(variable: VariableDefinition, type: string): VariableDefinition {
  const base = { id: variable.id, ...(variable.name === undefined ? {} : { name: variable.name }) };
  if (type === 'boolean') return { ...base, type: 'boolean', initial: false };
  if (type === 'text') return { ...base, type: 'text', initial: '' };
  return { ...base, type: 'number', initial: 0 };
}

function withInitial(variable: VariableDefinition, raw: string): VariableDefinition {
  if (variable.type === 'number') {
    const value = Number(raw);
    return { ...variable, initial: Number.isFinite(value) ? value : 0 };
  }
  if (variable.type === 'boolean') return { ...variable, initial: raw === 'true' || raw === 'yes' };
  return { ...variable, initial: raw };
}
