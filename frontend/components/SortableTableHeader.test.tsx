import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SortableTableHeader } from './SortableTableHeader';

describe('SortableTableHeader component', () => {
  const defaultProps = {
    label: 'Nom du Produit',
    sortKey: 'productname',
    currentDirection: null as any,
    onSort: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the header label correctly', () => {
    render(
      <table>
        <thead>
          <tr>
            <SortableTableHeader {...defaultProps} />
          </tr>
        </thead>
      </table>
    );

    expect(screen.getByText('Nom du Produit')).toBeInTheDocument();
  });

  it('displays correct indicators for sort directions', () => {
    // 1. Inactive sort state
    const { rerender } = render(
      <table>
        <thead>
          <tr>
            <SortableTableHeader {...defaultProps} />
          </tr>
        </thead>
      </table>
    );
    expect(screen.getByText('⇅')).toBeInTheDocument();

    // 2. Ascending sort state
    rerender(
      <table>
        <thead>
          <tr>
            <SortableTableHeader {...defaultProps} currentDirection="asc" />
          </tr>
        </thead>
      </table>
    );
    expect(screen.getByText('▲')).toBeInTheDocument();

    // 3. Descending sort state
    rerender(
      <table>
        <thead>
          <tr>
            <SortableTableHeader {...defaultProps} currentDirection="desc" />
          </tr>
        </thead>
      </table>
    );
    expect(screen.getByText('▼')).toBeInTheDocument();
  });

  it('triggers onSort callback with the correct key when clicked', () => {
    const onSortMock = jest.fn();
    render(
      <table>
        <thead>
          <tr>
            <SortableTableHeader {...defaultProps} onSort={onSortMock} />
          </tr>
        </thead>
      </table>
    );

    const thElement = screen.getByRole('columnheader');
    fireEvent.click(thElement);

    expect(onSortMock).toHaveBeenCalledTimes(1);
    expect(onSortMock).toHaveBeenCalledWith('productname');
  });
});
