import { fireEvent, render, screen } from '@testing-library/react';

import MenuIconSelector from './menu-icon-selector';

describe('MenuIconSelector', () => {
  const menuItems = [
    { id: 'a', label: 'Alpha', icon: <span>a-icon</span> },
    { id: 'b', label: 'Beta', icon: <span>b-icon</span> },
  ];

  it('should render the menu items and report a menu change', () => {
    const onMenuChange = vi.fn();
    render(
      <MenuIconSelector
        menuItems={menuItems}
        activeMenu="a"
        onMenuChange={onMenuChange}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(2);
    fireEvent.click(screen.getByText('b-icon'));
    expect(onMenuChange).toHaveBeenCalledWith('b');
  });
});
