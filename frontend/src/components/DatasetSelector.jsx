import * as Tooltip from '@radix-ui/react-tooltip';
import React, { useState } from "react";
import {
  Database,
  FileText,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import './DatasetSelector.css';

const DatasetSelector = ({
  datasets = [],
  selectedDatasetIds = [],
  toggleDatasetSelection,
}) => {
  const [showOptions, setShowOptions] = useState(true);

  const getIconForDataset = (name) =>
    name.toLowerCase().includes("sheets") ? <FileText className="dataset-item-icon" /> : <Database className="dataset-item-icon" />;

  return (
    <div className="dataset-selector-container">
      <div 
        className="dataset-selector-header"
        onClick={() => setShowOptions(prev => !prev)}
      >
        <span>Datasets Available</span>
        {showOptions ? 
          <ChevronUp className="dataset-selector-header-icon" /> : 
          <ChevronDown className="dataset-selector-header-icon" />
        }
      </div>

      {showOptions && (
        <div className="dataset-options-container">
          {datasets.length > 0 ? (
            datasets.map((dataset) => {
              const isSelected = selectedDatasetIds.includes(dataset.id);

              return (
                <div
                  key={dataset.id}
                  onClick={() => toggleDatasetSelection(dataset.id)}
                  className={`dataset-item ${isSelected ? 'selected' : 'unselected'}`}
                >
                  <div className="dataset-item-content">
                    {getIconForDataset(dataset.name)}
                    
                    {/* Tooltip Wrapper */}
                    <Tooltip.Provider>
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <span className="dataset-item-name">
                            {dataset.name}
                          </span>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content
                            className="dataset-tooltip"
                            side="top"
                            sideOffset={5}
                          >
                            {dataset.name}
                            <Tooltip.Arrow className="dataset-tooltip-arrow" />
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    </Tooltip.Provider>
                    
                  </div>
                  <span className="dataset-selection-indicator">
                    {isSelected ? "✓" : "+"}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="dataset-loading">Loading datasets...</div>
          )}
        </div>
      )}
    </div>
  );
};

export default DatasetSelector;
