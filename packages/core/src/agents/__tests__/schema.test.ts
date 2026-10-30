import { DevelopmentSpecificationSchema } from '../index.js';

describe('DevelopmentSpecificationSchema', () => {
  it('accepts a complete structured specification', () => {
    const specification = DevelopmentSpecificationSchema.parse({
      title: 'Export support',
      problem: 'Users cannot export their data.',
      scope: ['Add CSV export'],
      nonGoals: ['Scheduled exports'],
      acceptanceCriteria: ['A user can download a CSV file.'],
      constraints: [],
    });

    expect(specification.scope).toEqual(['Add CSV export']);
  });

  it('rejects a specification without acceptance criteria', () => {
    const result = DevelopmentSpecificationSchema.safeParse({
      title: 'Export support',
      problem: 'Users cannot export their data.',
      scope: ['Add CSV export'],
      nonGoals: [],
      acceptanceCriteria: [],
      constraints: [],
    });

    expect(result.success).toBe(false);
  });
});
