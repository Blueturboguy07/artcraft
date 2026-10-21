import { fireEvent, render, screen } from '@testing-library/react';

import { ButtonDropdown } from './button-dropdown';

describe('ButtonDropdown', () => {
  it('should render the label and show the options when opened', () => {
    render(
      <ButtonDropdown
        label="Actions"
        options={[{ label: 'First option' }, { label: 'Second option' }]}
      />,
    );
    expect(screen.getByText('Actions')).toBeTruthy();
    fireEvent.click(screen.getByText('Actions'));
    expect(screen.getByText('First option')).toBeTruthy();
    expect(screen.getByText('Second option')).toBeTruthy();
  });
});
