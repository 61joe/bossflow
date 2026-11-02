import { renderSpecification } from '../index.js';

describe('renderSpecification', () => {
  it('renders populated lists', () => {
    const markdown = renderSpecification({
      title: 'Export',
      problem: 'No export',
      scope: ['Add export'],
      nonGoals: ['Scheduled export'],
      acceptanceCriteria: ['Downloads CSV'],
      constraints: ['Keep API compatible'],
    });

    expect(markdown).toContain('- Add export');
    expect(markdown).toContain('- Scheduled export');
    expect(markdown).toContain('- Keep API compatible');
  });

  it('renders an explicit empty-list marker', () => {
    const markdown = renderSpecification({
      title: 'Export',
      problem: 'No export',
      scope: ['Add export'],
      nonGoals: [],
      acceptanceCriteria: ['Downloads CSV'],
      constraints: [],
    });

    expect(markdown.match(/- None\./g)).toHaveLength(2);
  });
});
