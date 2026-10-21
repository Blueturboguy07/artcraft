import { fireEvent, render, screen } from '@testing-library/react';
import { XIcon } from 'lucide-react';

import { ButtonIcon } from './button-icon';

describe('ButtonIcon', () => {
  it('should render a button that calls onClick', () => {
    const onClick = vi.fn();
    render(<ButtonIcon icon={XIcon} onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
