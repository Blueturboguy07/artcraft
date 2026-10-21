import { render, screen } from '@testing-library/react';

import { Badge } from './badge';

describe('Badge', () => {
  it('should render its label', () => {
    render(<Badge label="New" />);
    expect(screen.getByText('New')).toBeTruthy();
  });
});
