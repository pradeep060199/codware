import { Component, Input, } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ColDef, GetServerSideGroupKey, GridApi, GridReadyEvent, IServerSideDatasource, IServerSideGetRowsParams, IServerSideGetRowsRequest, IsServerSideGroup, IsServerSideGroupOpenByDefaultParams, ITooltipParams, RowGroupOpenedEvent, RowModelType } from '@ag-grid-community/core';
import { NgxSpinnerService } from 'ngx-spinner';
import { RendererDataService } from '../../services/renderer-data.service';
import { RendererService } from '../../services/renderer.service';
import { getColumnValue } from '../../utils/configuration/config';
import { HandleSkipedStatusService } from '../../services/handle-skiped-status.service';

@Component({
  selector: 'lib-tree-ag-grid',
  templateUrl: './tree-ag-grid.component.html',
  styleUrls: ['./tree-ag-grid.component.scss']
})
export class TreeAgGridComponent {

  @Input() config!: any;
  @Input() gridData!: any;
  private gridApi!: GridApi;
  groupDefaultExpanded=1

  public columnDefs: ColDef[] = [];

  public defaultColDef: ColDef = {
    width: 235,
    flex: 1,
    sortable: false,
    suppressMenu: true,
  };

  public autoGroupColumnDef: ColDef = {
    field: "",
    headerName: '',
    minWidth: 450,
  };

  public rowModelType: RowModelType = "serverSide";
  public cacheBlockSize = 20;

  public isServerSideGroupOpenByDefault: (
    params: IsServerSideGroupOpenByDefaultParams,
  ) => boolean = (params: IsServerSideGroupOpenByDefaultParams) => {
    let searchValue:string | null = this.rendererDataService.getSearchedValue();
    if (searchValue && searchValue.trim() !== '') {
      // Only process groups (parent items), not leaf items
      if (!params.data.group) {
        return false;
      }
      
      // Check if any field in the group data contains the search value
      let hasMatchingField = false;
      let exactMatch = false;
      
      for (const field in params.data) {
        const fieldValue = params.data[field];
        
        if (fieldValue && typeof fieldValue === 'string') {
          const fieldValueLower = fieldValue.toLowerCase();
          const searchValueLower = searchValue.toLowerCase();
          
          if (fieldValueLower.includes(searchValueLower)) {
            hasMatchingField = true;
            if (fieldValueLower === searchValueLower) {
              exactMatch = true;
            }
          }
        }
        if (fieldValue && typeof fieldValue === 'number') {
          const fieldValueStr = fieldValue.toString().toLowerCase();
          const searchValueLower = searchValue.toLowerCase();
          
          if (fieldValueStr.includes(searchValueLower)) {
            hasMatchingField = true;
            if (fieldValueStr === searchValueLower) {
              exactMatch = true;
            }
          }
        }
      }
      
      // If this item exactly matches the search and has children (is a group), open it
      // This ensures searched items with children are expanded
      if (exactMatch && params.data.group) {
        return true;
      }
      
      // If this item contains the search term (partial match) and has children, open it
      if (hasMatchingField && params.data.group) {
        return true;
      }
      
      // If this is a group and we haven't found a match, open it to allow searching through children
      // This ensures that parent groups are opened so we can find nested child items
      if (params.data.group) {
        return true;
      }
    }
    return false;
  };

  public isServerSideGroup: IsServerSideGroup = (dataItem: any) => {
    return dataItem.group;
  };

  public getServerSideGroupKey: GetServerSideGroupKey = (dataItem: any) => {
    return dataItem[this.groupKey];
  };

  public rowData!: any[];
  currentViewResponse: any;
  groupCols: any;
  groupKey:string='';
  paginationData: any;
  totalPages: any;
  currentPage: any;
  childParam ='';
  leafConfig: any;
  public tooltipShowDelay = 700;
  isCommissionView: boolean = false;
  clickedRowData: any = null;
  searchValue: string | null= '';
  private searchedNodeToSelect: any = null;

  constructor(
    private rendererService: RendererService,
    private rendererDataService: RendererDataService,
    private translate: TranslateService,
    private spinner: NgxSpinnerService,
    private handleSkipedStatusService: HandleSkipedStatusService) {
    this.currentViewResponse = this.rendererDataService.currentResponse;
  }

  ngOnInit() {
    this.groupCols = this.config.treeListProperty.groupByColumnName;
    this.leafConfig = this.config.treeListProperty.leafConfig;
    this.isCommissionView = this.config?.commissionView;
    this.groupKey = this.groupCols.column;
    this.autoGroupColumnDef.headerName = this.translate.instant(this.config.treeListProperty.groupName);
    this.configureGrid();
    localStorage.setItem('gridData', JSON.stringify(this.gridData))
    this.rendererDataService.currentTabDataSubject$.subscribe((data:any)=> {
      if (data) {
        this.currentViewResponse = data;
        this.loadData();
      }
    });

    // Subscribe to search value changes to refresh grid when search is performed
    this.rendererDataService.searchedValue$.subscribe((value: string) => {
      console.log('here searchValue', value)
      this.searchValue = value;
      if (this.gridApi) {
        if (value && value.trim() !== '') {
          // Refresh the grid to apply the new isServerSideGroupOpenByDefault logic
          this.gridApi.refreshServerSide({ purge: true });
          
          // Store the search value to potentially select/highlight the matching node
          this.searchedNodeToSelect = value;
        } else {
          // When search is cleared, refresh to close all groups
          this.gridApi.refreshServerSide({ purge: true });
          this.searchedNodeToSelect = null;
        }
      }
    });
  }

  configureGrid() {
    this.columnDefs = this.config.gridColumnProperties.map((gridColumn: any) =>
      this.addColumn(gridColumn)
    );
  }

  toolTipValueGetter = (params: ITooltipParams) =>
    params.value == null || params.value === "" ? "- Missing -" : params.value;
 
  addColumn(gridColumn: any) {
    let column: any = {};
    column["metadataKeys"] = gridColumn.metadataKeys;
    column["headerName"] = this.translate.instant(gridColumn.resourceKey);
    column["headerClass"] = this.config?.headerClass,
    column['sortable'] = gridColumn.sortable;
    column["editable"] = gridColumn.editable;
    column["field"] = gridColumn.colId;
    column["hide"] = gridColumn.hide;
    column["tooltipValueGetter"]= this.toolTipValueGetter;
    if (this.groupCols) {
      if (gridColumn.colId === this.groupCols.column) {
        this.groupCols = this.groupCols.groupByColumnName;
        
        column["field"] = gridColumn.colId;
        column["hide"] = true;
        this.autoGroupColumnDef.field = gridColumn.colId;
      }
      column["headerComponentParams"] = {
        template: `<span class="ag-header-cell-label">${gridColumn.name}</span>`,
      }
    }
    column["headerComponentParams"] = {
      template: `<span class="ag-header-cell-label">${this.translate.instant(gridColumn.resourceKey)}</span>`,
    }
    if(gridColumn?.align && gridColumn?.align ==='right'){
      column["type"]= 'rightAligned';
    }else if(gridColumn?.align && gridColumn?.align ==='center'){
      column["cellStyle"]= { 'text-align': 'center' }
    }else{
      column["cellStyle"]= { 'text-align': 'left' }
    }
    return column;
  }

  refreshCache(route: string[]) {
    this.gridApi.refreshServerSide({ route: route, purge: true });
  }

  paginationEvent(evt:any){
    this.paginationData = {
      pageNumber: evt.currentPage,
      pageSize: evt.pageSize,
    };
    this.loadData(true);
  }

  updateParams(isPageEvent?: any) {
    if (this.config.api?.requestParams) {
      if (!this.currentViewResponse) {
        this.currentViewResponse = this.rendererDataService.getCurrentTabData()
      }
      this.config.api?.requestParams?.forEach((element: any) => {
        if (element?.isChildren) {
          this.childParam = element.key;
        }
        if (element?.metadataKeys) {
          const data = JSON.parse(JSON.stringify(this.currentViewResponse));
          element.value = getColumnValue(data, element.metadataKeys[0])?.trim();
        }
        if(this.paginationData && this.paginationData[element.key]) {
          element.value = this.paginationData[element.key];
        }

        if(element.key === "data.isTopLevel") {
          element.value = true
        }

      });
      this.config.api.requestParams = this.config.api?.requestParams.filter((element: any) => element.key !== this.childParam)
    }
  }

 replaceRequestParamByKey(paramsArray: any[], targetKey: any, createNewParamFn: () => any) {
  const index = paramsArray.findIndex((param) => param.key === targetKey);
  if (index !== -1) {
    paramsArray[index] = createNewParamFn();
  }
}

  onGridReady(params: GridReadyEvent) {
    this.gridApi = params.api;
    this.loadData();
  }

  loadData(isPageEvent?:boolean){
    this.updateParams(isPageEvent);
    this.spinner.show();
    this.rendererService.makeRequest(this.config.api).subscribe((response: any) => {
      const generatedData = generateData(response.data.content, this);
      this.totalPages = response.data.totalPages;
      this.currentPage = response.data?.pageNumber;
      this.rendererDataService.exportDataCount = response.data?.totalElements;
      this.spinner.hide();
      const datasource = createServerSideDatasource(generatedData);
      this.gridApi!.setGridOption("serverSideDatasource", datasource);
      this.gridApi.sizeColumnsToFit();
      
      // After data is loaded, if we have a search value, try to select/highlight the matching node
      if (this.searchedNodeToSelect) {
        setTimeout(() => {
          this.selectSearchedNode(this.searchedNodeToSelect);
        }, 500); // Small delay to ensure nodes are rendered
      }
    })
  }

  // New method to select/highlight the searched node
  private selectSearchedNode(searchValue: string) {
    if (!this.gridApi || !searchValue) return;
    
    this.gridApi.forEachNode((node) => {
      if (node.data) {
        // Check if any field in the node data matches the search value
        for (const field in node.data) {
          const fieldValue = node.data[field];
          
          if (fieldValue && typeof fieldValue === 'string' && 
              fieldValue.toLowerCase() === searchValue.toLowerCase()) {
            // Select and ensure the node is visible
            node.setSelected(true);
            this.gridApi.ensureNodeVisible(node);
            
            // If it's a group node and has children, expand it
            if (node.data.group && !node.expanded) {
              node.setExpanded(true);
            }
            break;
          }
          
          if (fieldValue && typeof fieldValue === 'number' && 
              fieldValue.toString().toLowerCase() === searchValue.toLowerCase()) {
            // Select and ensure the node is visible
            node.setSelected(true);
            this.gridApi.ensureNodeVisible(node);
            
            // If it's a group node and has children, expand it
            if (node.data.group && !node.expanded) {
              node.setExpanded(true);
            }
            break;
          }
        }
      }
    });
  }

  onRowGroupOpened(event: RowGroupOpenedEvent<any>) {
    console.log('event', event);
    this.clickedRowData = event?.data;
    const currentId = event.node.id;

    if (event.node.expanded && !this.searchValue) {
      this.gridApi?.forEachNode((node) => {
        if (
          node.expanded &&
          node.id !== currentId &&
          node.uiLevel === event.node.uiLevel
        ) {
          node.setExpanded(false);
        }
      });
    }
    
    // Don't reset searchValue to null here to maintain search state
    // this.searchValue = null;
  }

  updateDisplayUriParam(paramsArray: any[]): void {
    const index = paramsArray.findIndex(param => param.key === 'data.displayUri');
    if (index !== -1) {
      paramsArray[index] = {
        key: 'data.correlationId',
        value: this.clickedRowData?.correlationId,
        metadataKeys: [
          {
            key: 'correlationId',
            type: 'string'
          }
        ]
      };
    }
    const filteredParams = paramsArray.filter(param => param.key !== 'data.parent');
    filteredParams.push({
      key: 'data.parent',
      value: this.clickedRowData?.id
    });

    paramsArray.length = 0;
    paramsArray.push(...filteredParams);
  }

}

function generateData(generatedServerData: any[], currentObject: any) {
  const generatedData = {
    getData: (request: IServerSideGetRowsRequest) => {
       async function extractRowsFromData(groupKeys: string[], data: any[]) {
        if (groupKeys.length === 0) {
          return data.map(function (d: any) {
            let rootData = d.data ? d.data: d;
            let groupCols = currentObject.config.treeListProperty.groupByColumnName;
            rootData[groupCols.column]='';
            if(groupCols.hasOwnProperty('metadataKeys') && groupCols.metadataKeys.length){
              let colData = '';
              groupCols?.metadataKeys?.forEach((element: any) => {
                colData = colData + getColumnValue(rootData, element);
              });
              rootData[groupCols.column]= colData;
            }
            let displayObject:any = { };
            currentObject.columnDefs?.forEach((column:any) => {
              if(column.hasOwnProperty('metadataKeys') && column.metadataKeys.length){
                displayObject['group'] = !!d.childrens;
                let colData = '';
                column?.metadataKeys?.forEach((element: any) => {
                  if (rootData.hasOwnProperty('childQty')) {
                    rootData.childQty = rootData.childQty.toString();
                  }
                  colData = colData + getColumnValue(rootData, element);
                });
                displayObject[column.field] = colData;
              }
            });
            displayObject.group = checkAllKeyValueMatch(rootData,currentObject.leafConfig)
            currentObject.gridApi.sizeColumnsToFit()
            displayObject["id"] = rootData?.id;
            displayObject["correlationId"] = rootData?.correlationId;
            return displayObject
          });
        }
        const key = groupKeys[0];
        for (let i = 0; i < data.length; i++) {
          const dataValue = data[i].data[currentObject.groupKey];
          const compareValues = comparekeyValues(key, dataValue);
          if (compareValues) {
            if(groupKeys.length === 1){
              const isTopLevelObject = currentObject.config.api.requestParams.find((obj: any) => obj.key === "data.isTopLevel");
              if (isTopLevelObject) {
                isTopLevelObject.value = false;
              } 
              
              if (!isTopLevelObject.value) {
                const existingParam = currentObject.config.api.requestParams.find(
                  (param: any) => param.key === "data.parent"
                );

                if (existingParam) {
                  existingParam.value = currentObject.clickedRowData?.id;
                } else {
                  currentObject.config.api.requestParams.push({
                    key: "data.parent",
                    value: currentObject.clickedRowData?.id
                  });
                }
              }


                const response = await currentObject.rendererService.makeRequest(currentObject.config.api).toPromise();
                data[i]["childrens"] = response.data.content;
            }
            return extractRowsFromData(
              groupKeys.slice(1),
              data[i].childrens.slice(),
            );
          }
        }
      }
      return extractRowsFromData(request.groupKeys, generatedServerData);
    },
  };
  return generatedData;
}

function checkAllKeyValueMatch(d:any, leafConfig:any) {
  for (let [key, value] of Object.entries(leafConfig)) {
    return d[key]!==value;
  }
}

function createServerSideDatasource(server: any) {
  const dataSource: IServerSideDatasource = {
    getRows: async (params: IServerSideGetRowsParams) => {
      const request = params.request;
      const doingInfinite = request.startRow != null && request.endRow != null;
      const allRows = await server.getData(request);
      const result = doingInfinite 
        ? {
          rowData: allRows.slice(request.startRow, request.endRow),
          rowCount: allRows.length,
        }
        : { rowData: allRows };
        params.success(result);
    },
  };
  return dataSource;
}

function comparekeyValues(groupKey: any, dataValue: any) {
  function normalizeGTIN(value: any) {
    const str = String(value).trim();
    return str.replace(/[^0-9]/g, '');
  }
  const normalizedGroupKey = normalizeGTIN(groupKey);
  const normalizedDataValue = normalizeGTIN(dataValue);
  return normalizedGroupKey === normalizedDataValue;
}

function checkAndAddUniqueEntry(array: any, newKey: any, newValue: any): boolean {
  for (let obj of array) {
      if (obj.key === newKey) {
          obj.value = newValue;
          return true;
      }
  }
  array.push({ key: newKey, value: newValue });
  return false;
}