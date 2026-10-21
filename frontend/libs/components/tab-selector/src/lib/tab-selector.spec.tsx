import { fireEvent, render, screen } from '@testing-library/react';

import TabSelector from './tab-selector';

describe('TabSelector', () => {
  const tabs = [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Beta' },
  ];

  it('should render the tabs and report a tab change', () => {
    const onTabChange = vi.fn();
    render(<TabSelector tabs={tabs} activeTab="a" onTabChange={onTabChange} />);
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    fireEvent.click(screen.getByText('Beta'));
    expect(onTabChange).toHaveBeenCalledWith('b');
  });
});
