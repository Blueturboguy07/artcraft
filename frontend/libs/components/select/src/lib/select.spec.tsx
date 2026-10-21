import { render, screen } from '@testing-library/react';

import Select from './select';

describe('Select', () => {
  const options = [
    { label: 'One', value: 1 },
    { label: 'Two', value: 2 },
  ];

  it('should show the label of the selected option', () => {
    render(<Select options={options} value={2} onChange={() => {}} />);
    expect(screen.getByRole('button').textContent).toContain('Two');
  });

  it('should show the placeholder when nothing is selected', () => {
    render(
      <Select options={options} onChange={() => {}} placeholder="Pick one" />,
    );
    expect(screen.getByText('Pick one')).toBeTruthy();
  });
});
