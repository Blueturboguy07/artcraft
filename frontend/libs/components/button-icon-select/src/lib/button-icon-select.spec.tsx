import { fireEvent, render, screen } from '@testing-library/react';
import { PlayIcon, PauseIcon } from 'lucide-react';

import { ButtonIconSelect } from './button-icon-select';

describe('ButtonIconSelect', () => {
  it('should render one button per option and report the chosen value', () => {
    const onOptionChange = vi.fn();
    render(
      <ButtonIconSelect
        options={[
          { value: 'play', icon: PlayIcon, text: 'Play' },
          { value: 'pause', icon: PauseIcon, text: 'Pause' },
        ]}
        onOptionChange={onOptionChange}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByText('Pause'));
    expect(onOptionChange).toHaveBeenCalledWith('pause');
  });
});
