/* eslint-disable no-console */
const fs = require('fs-extra')
const { join } = require('path')
const glob = require('glob')
const os = require('os')
const path = require('path')
const { setupV8Snapshots } = require('@tooling/v8-snapshot')
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')
const { cleanup } = require('./binary/binary-cleanup')
const { getIntegrityCheckSource } = require('./binary/binary-integrity-check')

module.exports = async function (params) {
  console.log('****************************')
  console.log('After pack hook')
  console.log(params.appOutDir)
  console.log(params.outDir)
  console.log(params.electronPlatformName)
  console.log('****************************')

  const packages = glob.sync('packages/*/node_modules', {
    cwd: params.packager.info._appDir,
  })

  const buildSubfoldersPerPlatform = {
    darwin: join('Cypress.app', 'Contents', 'Resources', 'app'),
    linux: join('resources', 'app'),
    win32: join('resources', 'app'), // TODO check this path
  }
  const buildSubfolder = buildSubfoldersPerPlatform[os.platform()]
  const outputFolder = join(params.appOutDir, buildSubfolder)

  console.log('copying node_modules to', outputFolder)

  for await (const packageNodeModules of packages) {
    console.log('copying', packageNodeModules)

    const sourceFolder = join(params.packager.info._appDir, packageNodeModules)
    const destinationFolder = join(outputFolder, packageNodeModules)

    await fs.copy(sourceFolder, destinationFolder)
  }

  const distNodeModules = path.join(params.packager.info._appDir, 'node_modules')
  const appNodeModules = path.join(outputFolder, 'node_modules')

  console.log('copying ', distNodeModules, ' to', appNodeModules)

  await fs.copy(distNodeModules, appNodeModules)

  console.log('all node_modules subfolders copied to', outputFolder)

  const exePathPerPlatform = {
    darwin: join(params.appOutDir, 'Cypress.app', 'Contents', 'MacOS', 'Cypress'),
    linux: join(params.appOutDir, 'Cypress'),
    win32: join(params.appOutDir, 'Cypress.exe'),
  }

  if (!['1', 'true'].includes(process.env.DISABLE_SNAPSHOT_REQUIRE)) {
    await fs.writeFile(path.join(outputFolder, 'index.js'), await fs.readFile(path.join(outputFolder, 'index.js'), 'utf8').replace('server/index.js', 'server/index.jsc'))
    await flipFuses(
      exePathPerPlatform[os.platform()],
      {
        version: FuseVersion.V1,
        [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: true,
      },
    )

    await cleanup(outputFolder)
    await setupV8Snapshots({ cypressAppPath: params.appOutDir, integrityCheckSource: getIntegrityCheckSource(outputFolder) })
  }
}
