import type { VerificationCommand } from '../contracts/index.js';
import {
  PACKAGE_MANAGER_RUN_ARGS,
  SCRIPT_ALIASES,
  VERIFICATION_COMMAND_LABELS,
} from './constant.js';
import type {
  PackageManager,
  ResolvedVerificationCommands,
  VerificationCommandKind,
  VerificationSettings,
} from './types.js';

interface ResolveVerificationCommandsOptions {
  readonly packageManager: PackageManager;
  readonly packageScripts: Readonly<Record<string, string>>;
  readonly settings: VerificationSettings;
}

export class VerificationCommandResolver {
  resolve(options: ResolveVerificationCommandsOptions): ResolvedVerificationCommands {
    const commands: VerificationCommand[] = [];
    const ambiguities: string[] = [];

    for (const kind of options.settings.requiredCommands) {
      const override = options.settings.commandOverrides[kind];
      if (override !== undefined) {
        commands.push({
          id: kind,
          label: VERIFICATION_COMMAND_LABELS[kind],
          command: override.command,
          args: [...override.args],
          required: true,
          timeoutMs: override.timeoutMs ?? options.settings.defaultTimeoutMs,
        });
        continue;
      }

      const scriptName = findScriptName(kind, options.packageScripts);
      if (scriptName === undefined) {
        ambiguities.push(
          `No ${kind} command is configured and none of these package scripts exist: ` +
            `${SCRIPT_ALIASES[kind].join(', ')}.`,
        );
        continue;
      }

      const packageManager = options.packageManager === 'unknown' ? 'npm' : options.packageManager;
      commands.push({
        id: kind,
        label: VERIFICATION_COMMAND_LABELS[kind],
        command: packageManager,
        args: [PACKAGE_MANAGER_RUN_ARGS[packageManager], scriptName],
        required: true,
        timeoutMs: options.settings.defaultTimeoutMs,
      });
    }
    return {
      commands,
      ambiguities,
    };
  }
}

function findScriptName(
  kind: VerificationCommandKind,
  packageScripts: Readonly<Record<string, string>>,
): string | undefined {
  return SCRIPT_ALIASES[kind].find((scriptName) => packageScripts[scriptName] !== undefined);
}
