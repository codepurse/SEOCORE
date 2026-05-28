import { Command } from 'commander';

export interface HelpSection {
  title: string;
  lines: string[];
}

export function configureHelp<T extends Command>(command: T): T {
  command.showHelpAfterError();
  command.showSuggestionAfterError();
  return command;
}

export function addHelpSections<T extends Command>(command: T, sections: HelpSection[]): T {
  const content = sections
    .filter(section => section.lines.length > 0)
    .map(section => `${section.title}:\n${section.lines.map(line => `  ${line}`).join('\n')}`)
    .join('\n\n');

  if (content) {
    command.addHelpText('after', `\n${content}`);
  }

  return command;
}

export function buildHelp<T extends Command>(command: T, sections: HelpSection[] = []): T {
  return addHelpSections(configureHelp(command), sections);
}
