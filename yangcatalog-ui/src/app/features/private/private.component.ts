import { Location } from '@angular/common';
import { Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ColDef, GridOptions } from 'ag-grid-community';
import { Lightbox } from 'ngx-lightbox';
import { combineLatest, Subject } from 'rxjs';
import { finalize, map, mergeMap, takeUntil } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AppAgGridComponent } from '../../shared/ag-grid/app-ag-grid.component';
import { YangStatsModel } from '../statistics/models/yang-stats-model';
import { PrivateService } from './private.service';

@Component({
  selector: 'yc-private',
  templateUrl: './private.component.html',
  styleUrls: ['./private.component.scss']
})
export class PrivateComponent implements OnInit, OnDestroy {

  @ViewChild('jsonPreviewGrid') ciscoAuthorsGrid: AppAgGridComponent;

  dependencyGraphs = {
    'modules-ietf': 'All IETF YANG data models Dependency Graph (updated daily)',
    'modules-all': 'ALL Industry YANG data models Dependency Graph (updated daily)',
    'ietf-interfaces': 'ietf-interfaces YANG data model (RFC 7223) Dependency Graph: within the IETF (updated daily)',
    'ietf-interfaces-all': 'ietf-interfaces YANG data model (RFC 7223) Dependency Graph: in the industry (updated daily)',
    'ietf-routing': 'ietf-routing YANG data model (draft-ietf-netmod-routing-cfg draft) Dependency Graph (updated daily)'
  };

  loading = true;
  draftsLoading = true;

  active = 1;

  sdoToVendorPieData = [];
  vendorPieData = [];
  sdoPieData = [];

  collDefsSdo: ColDef[] = [
    { colId: 'name', field: 'name', headerName: 'SDOs and Opensource' },
    { colId: 'numGithub', field: 'numGithub', headerName: 'Number in Github' },
    { colId: 'numCatalog', field: 'numCatalog', headerName: 'Number in Catalog' },
    { colId: 'percentageCompile', field: 'percentageCompile', headerName: '% that pass Compilation' },
    { colId: 'percentageExtra', field: 'percentageExtra', headerName: '% with Metadata' },
  ];

  collDefsVendor: ColDef[] = [
    { colId: 'name', field: 'name', headerName: 'Vendor' },
    { colId: 'numGithub', field: 'numGithub', headerName: 'Number in Github' },
    { colId: 'numCatalog', field: 'numCatalog', headerName: 'Number in Catalog' },
    { colId: 'percentageCompile', field: 'percentageCompile', headerName: '% that pass Compilation' },
    { colId: 'percentageExtra', field: 'percentageExtra', headerName: '% with Metadata' },
  ];

  stats: YangStatsModel;
  privateData: any;
  ciscoThumbs: any[] = [];
  dependencyGraphsThumbs: any[] = [];

  gridOptions: GridOptions = {
    onFirstDataRendered: () => {
      return this.headerHeightGetter;
    },
    onColumnResized: () => {
      return this.headerHeightGetter;
    }
  };

  /**
   * todo: move to tpl file
   */
  headerComponentParams = {
    template:
      '<div class="ag-cell-label-container" role="presentation">' +
      '  <span ref="eMenu" class="ag-header-icon ag-header-cell-menu-button"></span>' +
      '  <div ref="eLabel" class="ag-header-cell-label" role="presentation">' +
      '    <span ref="eText" class="ag-header-cell-text" role="columnheader" style="white-space: normal;"></span>' +
      '    <span ref="eSortOrder" class="ag-header-icon ag-sort-order"></span>' +
      '    <span ref="eSortAsc" class="ag-header-icon ag-sort-ascending-icon"></span>' +
      '    <span ref="eSortDesc" class="ag-header-icon ag-sort-descending-icon"></span>' +
      '    <span ref="eSortNone" class="ag-header-icon ag-sort-none-icon"></span>' +
      '    <span ref="eFilter" class="ag-header-icon ag-filter-icon"></span>' +
      '  </div>' +
      '</div>'
  };

  jsonPreviewColdefs: ColDef[] = [];
  problematicDraftsColDefs: ColDef[] = [
    {
      colId: '1', field: 'draftName', maxWidth: 400, headerName: 'Draft Name',
      cellRenderer: function (params) {
        return '<a target="_blank" href="https://www.ietf.org/archive/id/' + params.value + '">' + params.value + '</a>'
      }
    },
    { colId: '2', field: 'xymError', headerName: 'XYM Error' }
  ];
  jsonfileResultsContainerWidth = '100%';
  jsonPreviewData: any;


  defaultColDef = {
    autoHeight: true,
    resizable: false,
    sortable: true,
    cellStyle: { 'white-space': 'normal' },
    headerComponentParams: this.headerComponentParams
  };
  jsonfile = '';

  jsonPreviewHeader = '';

  private componentDestroyed: Subject<void> = new Subject<void>();
  templateMap = {};
  myBaseUrl = environment.WEBROOT_BASE_URL;
  ciscoStatsSelection = 'XR';
  showStatsOnly = false;
  currentStats = {};
  problematicDrafts = {}
  statsError = null;
  privateError = null;
  // TODO: Fetch this using dataService.getValidatorsVersions() method
  validatorsVersion = {
    'confd-version': 'confd-7.8',
    'pyang-version': '2.5.3',
    'xym-version': '0.6.1',
    'yangdump-version': 'yangdump-pro 20.10-9',
    'yanglint-version': 'yanglint 2.0.231'
  }
  tabIds = {
    'Statistics': 1,
    'SDO': 2,
    'Graphs': 3,
    'IETF': 4,
    'Cisco': 5,
    'Juniper': 6,
    'Huawei': 7,
    'Ciena': 8,
    'Fujitsu': 9,
    'Nokia': 10,
    'Etsi': 11,
    'OpenROADM': 12
  }
  queryParams = {
    'tab': 'Statistics'
  }

  constructor(
    private dataService: PrivateService,
    private lightbox: Lightbox,
    private route: ActivatedRoute,
    private router: Router,
    private location: Location
  ) { }


  ngOnInit(): void {

    combineLatest([this.route.params, this.route.queryParams]).pipe(
      map(results => ({ params: results[0], query: results[1] })),
      takeUntil(this.componentDestroyed)
    ).subscribe(results => {
      // params
      this.loadGeneralPrivateData().pipe(
        mergeMap(() => this.route.params),
        takeUntil(this.componentDestroyed)
      ).subscribe(
        params => {
          if (params.hasOwnProperty('jsonfile')) {
            this.jsonfile = params['jsonfile'].replace('.html', '').replace('YANGPageCompilation', '');
            this.initJsonFilePreview();
          } else {
            this.initCiscoAuthorsThumbs();
            this.initDependenczGraphsThumbs();
          }
        }
      );

      // query params
      if (results.query.hasOwnProperty('tab')) {
        this.queryParams['tab'] = results.query['tab'];
        if (results.query['tab'] in this.tabIds) {
          this.active = this.tabIds[results.query['tab']]
        } else {
          this.queryParams['tab'] = null;
        }
      }
    },
      err => {
        console.error(err);
      }
    );

    this.dataService.getStats().pipe(
      finalize(() => this.loading = false),
      takeUntil(this.componentDestroyed)
    ).subscribe(
      stats => {
        this.stats = stats;
        this.sdoToVendorPieData = this.stats.getSdoToVendorSums();
        this.vendorPieData = this.stats.getVendorGithubNumbers();
        this.sdoPieData = this.stats.getSdoGighubNumbers();
      },
      err => {
        this.statsError = err;
      }
    );

    this.dataService.getProblematicDrafts().pipe(
      finalize(() => this.draftsLoading = false),
      takeUntil(this.componentDestroyed)
    ).subscribe(
      result => {
        this.problematicDrafts = result;
      },
      err => {
        this.statsError = err;
      }
    );
  }

  private loadGeneralPrivateData() {
    return this.dataService.getPrivateJson().pipe(
      map(response => this.privateData = response),
      finalize(() => this.loading = false),
      takeUntil(this.componentDestroyed)
    );
  }

  openImagePreview(thumbsList, index: number): void {
    this.lightbox.open(thumbsList, index);
  }

  closeImagePreview(): void {
    this.lightbox.close();
  }

  // initCiscoAuthorsJsonPreview() {
  //   this.jsonPreviewHeader = 'Cisco Authors: YANG Data Models extracted from IETF drafts';
  //   this.jsonPreviewColdefs = [
  //     {colId: '0', field: '0', maxWidth: 200, headerName: 'YANG Model'},
  //     {colId: '1', field: '1', maxWidth: 100, headerName: 'Draft Name'},
  //     {colId: '2', field: '2', maxWidth: 100, headerName: 'All Authors Email'},
  //     {colId: '3', field: '3', maxWidth: 100, headerName: 'Only Cisco Email'},
  //     {colId: '4', field: '4', maxWidth: 100, headerName: 'Download the YANG model'},
  //     {colId: '5', field: '5', maxWidth: 150, headerName: 'Compilation'},
  //     {colId: '6', field: '6', maxWidth: 250, headerName: 'Compilation Results (pyang --ietf)'},
  //     {colId: '7', field: '7', maxWidth: 300, headerName: 'Compilation Results (pyang). Note: also generates errors for imported files.'},
  //     {colId: '8', field: '8', maxWidth: 300, headerName: 'Compilation Results (confdc) Note: also generates errors for imported files'},
  //     {colId: '9', field: '9', maxWidth: 300, headerName: 'Compilation Results (yumadump-pro). Note: also generates errors for imported files.'},
  //     {colId: '10', field: '10', maxWidth: 300, headerName: 'Compilation Results (yanglint -V -i). Note: also generates errors for imported files.'},
  //   ];
  //
  //
  //   this.templateMap = {
  //     '1': 'htmlContentTemplate',
  //     '2': 'htmlContentTemplate',
  //     '3': 'htmlContentTemplate',
  //     '4': 'htmlContentTemplate',
  //     '5': 'htmlContentTemplate'
  //
  //   };
  //   this.dataService.loadData(this.privateData['graphs-cisco-authors'][0]).pipe(
  //     takeUntil(this.componentDestroyed)
  //   ).subscribe(
  //     res => this.jsonPreviewData = res,
  //     err => this. = err
  //   );
  // }


  initYangPageJsonPreview() {
    this.jsonPreviewHeader = this.jsonfile;

    this.jsonPreviewColdefs = [
      { colId: '0', field: '0', maxWidth: 200, headerName: 'YANG Model' },
      { colId: '1', field: '1', maxWidth: 100, headerName: 'Draft Name' },
      { colId: '2', field: '2', maxWidth: 100, headerName: 'Email' },
      { colId: '3', field: '3', maxWidth: 100, headerName: 'Download the YANG model' },
      { colId: '5', field: '3', maxWidth: 140, headerName: 'Compilation' },
      {
        colId: '6',
        field: '4',
        maxWidth: 250,
        headerName: `Compilation Result (pyang --ietf). ${this.validatorsVersion['pyang-version']}`
      },
      {
        colId: '7',
        field: '8',
        maxWidth: 250,
        headerName: `Compilation Result (pyang). Note: also generates errors for imported files. ${this.validatorsVersion['pyang-version']}`
      },
      {
        colId: '6',
        field: '6',
        maxWidth: 250,
        headerName: `Compilation Results (confdc) Note: also generates errors for imported files. ${this.validatorsVersion['confd-version']}`
      },
      {
        colId: '8',
        field: '7',
        maxWidth: 300,
        headerName: `Compilation Results (yangdump-pro). Note: also generates errors for imported files. ${this.validatorsVersion['yangdump-version']}`
      },
      {
        colId: '9',
        field: '8',
        maxWidth: 300,
        headerName: `Compilation Results (yanglint -V -i). Note: also generates errors for imported files. ${this.validatorsVersion['yanglint-version']}`
      },
    ];

    this.templateMap = {
      1: 'htmlContentTemplate',
      2: 'htmlContentTemplate',
      3: 'htmlContentTemplate',
      5: 'htmlContentTemplate',

    };
    this.dataService.loadAndTransformObjData(this.jsonfile + '.json').pipe(
      takeUntil(this.componentDestroyed)
    ).subscribe(
      res => {
        this.jsonPreviewData = res;
      },
      err => this.privateError = err
    );
  }

  initStatisticsJsonPreview() {
    this.jsonPreviewHeader = 'General Statistics Data';

    this.jsonPreviewColdefs = [
      { colId: '0', field: '0', maxWidth: 300, headerName: 'YANG Models' },
      { colId: '1', field: '1', maxWidth: 250, headerName: 'Number of YANG data models that passed compilation' },
      { colId: '2', field: '2', maxWidth: 250, headerName: 'Number of YANG data models that passed compilation with warnings' },
      { colId: '3', field: '4', maxWidth: 250, headerName: 'Number of YANG data models that failed compilation' },
      { colId: '4', field: '3', maxWidth: 250, headerName: 'Total number of YANG data models' }
    ];

    this.dataService.loadAndTransformStatisticsObjData('stats/AllYANGPageMain.json').pipe(
      takeUntil(this.componentDestroyed)
    ).subscribe(
      res => {
        this.jsonPreviewData = res;
      },
      err => this.privateError = err
    );
  }

  initGeneralStatisticsJsonPreview() {
    const statsType = this.jsonfile.replace('YANGPageMain', '');
    this.jsonPreviewHeader = 'Statistics ' + statsType;

    this.jsonPreviewColdefs = [
      { colId: '0', field: '0', maxWidth: 200, headerName: 'YANG Models' },
      { colId: '1', field: '1', maxWidth: 300, headerName: 'Number of YANG data models that passed compilation' },
      { colId: '2', field: '2', maxWidth: 300, headerName: 'Number of YANG data models that passed compilation with warnings' },
      { colId: '3', field: '3', maxWidth: 300, headerName: 'Number of YANG data models that failed compilation' },
    ];

    this.dataService.loadAndGetStatisticsForOneType('stats/AllYANGPageMain.json', statsType).pipe(
      takeUntil(this.componentDestroyed)
    ).subscribe(
      res => {
        this.currentStats = res;
        // this.jsonPreviewData = res;
      },
      err => this.privateError = err
    );
  }

  initYangPageRfcStandardJsonPreview() {
    this.jsonPreviewHeader = this.jsonfile;

    this.jsonPreviewColdefs = [
      { colId: '0', field: '0', maxWidth: 200, headerName: 'YANG Model' },
      { colId: '1', field: '1', maxWidth: 250, headerName: 'Compilation' },
      {
        colId: '2',
        field: '2',
        maxWidth: 250,
        headerName: `Compilation Result (pyang --ietf). ${this.validatorsVersion['pyang-version']}`
      },
      {
        colId: '3',
        field: '3',
        maxWidth: 250,
        headerName: `Compilation Result (pyang). Note: also generates errors for imported files. ${this.validatorsVersion['pyang-version']}`
      },
      {
        colId: '4',
        field: '4',
        maxWidth: 250,
        headerName: `Compilation Results (confdc) Note: also generates errors for imported files. ${this.validatorsVersion['confd-version']}`
      },
      {
        colId: '5',
        field: '5',
        maxWidth: 300,
        headerName: `Compilation Results (yangdump-pro). Note: also generates errors for imported files. ${this.validatorsVersion['yangdump-version']}`
      },
      {
        colId: '6',
        field: '6',
        maxWidth: 300,
        headerName: `Compilation Results (yanglint -V -i). Note: also generates errors for imported files. ${this.validatorsVersion['yanglint-version']}`
      },
    ];

    this.templateMap = {
      1: 'htmlContentTemplate',
      2: 'htmlContentTemplate',
      3: 'htmlContentTemplate',

    };
    this.dataService.loadAndTransformObjData(this.jsonfile + '.json').pipe(
      takeUntil(this.componentDestroyed)
    ).subscribe(
      res => {
        this.jsonPreviewData = res;
      },
      err => this.privateError = err
    );
  }

  initGeneralJsonPreview() {
    this.jsonPreviewHeader = this.jsonfile;

    this.jsonPreviewColdefs = [
      { colId: '0', field: '0', maxWidth: 200, headerName: 'YANG Model' },
      { colId: '1', field: '1', maxWidth: 250, headerName: 'Compilation' },
      {
        colId: '2',
        field: '2',
        maxWidth: 250,
        headerName: `Compilation Result (pyang --ietf). ${this.validatorsVersion['pyang-version']}`
      },
      {
        colId: '3',
        field: '3',
        maxWidth: 250,
        headerName: `Compilation Result (pyang). Note: also generates errors for imported files. ${this.validatorsVersion['pyang-version']}`
      },
      {
        colId: '4',
        field: '4',
        maxWidth: 250,
        headerName: `Compilation Results (confdc) Note: also generates errors for imported files. ${this.validatorsVersion['confd-version']}`
      },
      {
        colId: '5',
        field: '5',
        maxWidth: 300,
        headerName: `Compilation Results (yangdump-pro). Note: also generates errors for imported files. ${this.validatorsVersion['yangdump-version']}`
      },
      {
        colId: '6',
        field: '6',
        maxWidth: 300,
        headerName: `Compilation Results (yanglint -V -i). Note: also generates errors for imported files. ${this.validatorsVersion['yanglint-version']}`
      },
    ];

    this.templateMap = {
      1: 'htmlContentTemplate',
      2: 'htmlContentTemplate',
      3: 'htmlContentTemplate',

    };
    this.dataService.loadAndTransformObjData(this.jsonfile + '.json').pipe(
      takeUntil(this.componentDestroyed)
    ).subscribe(
      res => {
        this.jsonPreviewData = res;
      },
      err => this.privateError = err
    );
  }

  initYangPageDraftExampleJsonPreview() {
    this.jsonPreviewHeader = this.jsonfile;

    this.jsonPreviewColdefs = [
      { colId: '0', field: '0', maxWidth: 300, headerName: 'YANG Model' },
      { colId: '1', field: '1', maxWidth: 300, headerName: 'Draft Name' },
      { colId: '2', field: '2', maxWidth: 300, headerName: 'Email' },
      { colId: '3', field: '3', maxWidth: 200, headerName: 'Compilation' },
      { colId: '4', field: '4', maxWidth: 400, headerName: 'Compilation Result (pyang --ietf' },
      {
        colId: '5',
        field: '5',
        maxWidth: 400,
        headerName: 'Compilation Result (pyang). Note: also generates errors for imported files.'
      },
    ];

    this.templateMap = {
      1: 'htmlContentTemplate',
      2: 'htmlContentTemplate',
      3: 'htmlContentTemplate',
      4: 'htmlContentTemplate',

    };
    this.dataService.loadAndTransformObjData(this.jsonfile + '.json').pipe(
      takeUntil(this.componentDestroyed)
    ).subscribe(
      res => {
        this.jsonPreviewData = res;
      },
      err => this.privateError = err
    );
  }

  initYangPageRfcJsonPreview() {
    this.jsonPreviewHeader = this.jsonfile;

    this.jsonPreviewColdefs = [
      { colId: '0', field: '0', maxWidth: 300, headerName: 'YANG Model (and Submodel)' },
      { colId: '1', field: '1', maxWidth: 300, headerName: 'RFC' },
    ];

    this.templateMap = {
      1: 'htmlContentTemplate',
      2: 'htmlContentTemplate',

    };
    this.dataService.loadAndTransformRfcObjData(this.jsonfile + '.json').pipe(
      takeUntil(this.componentDestroyed)
    ).subscribe(
      res => {
        this.jsonPreviewData = res;
      },
      err => this.privateError = err
    );
  }


  private initCiscoAuthorsThumbs() {
    this.privateData['graphs-cisco-authors'].filter(item => item.indexOf('.png') !== -1).forEach(
      image => this.ciscoThumbs.push({
        src: 'private/' + image,
        thumb: 'private/' + image
      })
    );
  }

  private initDependenczGraphsThumbs() {
    Object.keys(this.dependencyGraphs).forEach(
      image => this.dependencyGraphsThumbs.push({
        src: 'private/figures/' + image + '.png',
        thumb: 'private/figures/' + image + '.png',
        caption: this.dependencyGraphs[image]
      })
    );
  }

  ngOnDestroy(): void {
    this.componentDestroyed.next();
  }


  headerHeightGetter() {
    const columnHeaderTexts = [
      document.querySelectorAll('.ag-header-cell-text')
    ];
    const clientHeights = columnHeaderTexts.map(
      headerText => headerText['clientHeight']
    );
    const tallestHeaderTextHeight = Math.max(...clientHeights);

    return tallestHeaderTextHeight;
  }

  onGridReady(event: any) {
    // setTimeout(() => {
    //   const newSize = this.ciscoAuthorsGrid.getColsViewportScrollWidth() + 25;
    //   this.jsonfileResultsContainerWidth = (newSize) + 'px';
    // });
  }

  private initJsonFilePreview() {

    this.showStatsOnly = false;
    this.currentStats = {};

    const jsonPreviewInitMethodMap = {
      // IETFCiscoAuthors: this.initCiscoAuthorsJsonPreview,
      IETFDraft: this.initYangPageJsonPreview,
      IETFDraftExample: this.initYangPageDraftExampleJsonPreview,
      IETFYANGRFC: this.initYangPageRfcJsonPreview,
      RFCStandard: this.initYangPageRfcStandardJsonPreview,
      BBF: this.initYangPageRfcStandardJsonPreview,
      MEFStandard: this.initYangPageRfcStandardJsonPreview,
      MEFExperimental: this.initYangPageRfcStandardJsonPreview,
      IEEEStandard: this.initYangPageRfcStandardJsonPreview,
      SysrepoInternal: this.initYangPageRfcStandardJsonPreview,
      SysrepoApplication: this.initYangPageRfcStandardJsonPreview,
      ONFOpenTransport: this.initYangPageRfcStandardJsonPreview,
      Openconfig: this.initYangPageRfcStandardJsonPreview,
      AllYANGPageMain: this.initStatisticsJsonPreview,
    };

    if (jsonPreviewInitMethodMap.hasOwnProperty(this.jsonfile)) {
      jsonPreviewInitMethodMap[this.jsonfile].bind(this)();
    } else {
      if (this.jsonfile.indexOf('YANGPageMain') !== -1) {
        this.showStatsOnly = true;
        this.initGeneralStatisticsJsonPreview();
      } else {
        this.initGeneralJsonPreview();
      }
    }

  }

  jsonExtractFileName(file: string) {
    return file.replace('.json', '');
  }

  onNavTabChange(event: any) {
    const newTabName = Object.keys(this.tabIds).find(key => this.tabIds[key] === event.nextId);
    this.queryParams['tab'] = newTabName
    this.updateURL();
  }

  updateURL() {
    const url = this.router.createUrlTree(
      [],
      {
        queryParams: this.queryParams
      }).toString();

    this.location.go(url);
  }
}
