import * as puppeteer from "puppeteer";
import * as fs from "fs"
import { convertCompilerOptionsFromJson } from "typescript";

const website = 'https://kungfutea.thelevelup.com/locations/631105/category/815882853?fulfillment=pickup&lat=42.4072107&lng=-71.3824374'
// const goodComputer = false
const headless = false
const restaurantName = 'kungFuTea'

interface Option {
    name: string
    price: string | undefined
}

interface FoodOption {
    name: string
    minChoices: number
    maxChoices: number | undefined
    options: Option[]
}

interface Item {
    name: string
    description?: string
    price: string
    foodOptions: FoodOption[]
    image: string | undefined
}

interface CategoryInfo {
    categoryName: string
    items: Item[]
}

class MenuMaker {

    url: string
    browser: puppeteer.Browser
    page: puppeteer.Page

    constructor(url: string) {
        this.url = url
    }

    async init(): Promise<void> {
        this.browser = await puppeteer.launch({headless: headless})
        this.page = await this.browser.newPage()
        await this.page.goto(this.url)
        await this.clickConfirmLocation()
        const menu: CategoryInfo[] = await this.scrapeMenu()
        this.writeToFile('kft', menu)
        // console.log(JSON.stringify(menu, null, 4))
        await this.browser.close()
    }

    writeToFile(filename: string, menu: CategoryInfo[]) {
        fs.writeFileSync(filename + '.json', JSON.stringify(menu, null, 4))
    }

    async clickConfirmLocation(){
        await this.page.waitForSelector('div.lu-button-content')
        const saveButton: puppeteer.ElementHandle<Element> | null = await this.page.$('div.lu-button-content')
        console.log(saveButton)
        await saveButton?.evaluate((button: any) => button.click())
    }

    async scrapeFoodOptions(item: puppeteer.ElementHandle<Element>) : Promise<FoodOption[]>{
        const button = (await item.$('button'))!
        await button.evaluate(el => el.click())
        await this.page.waitForSelector('div.rc-dialog-body')
        const modal = (await this.page.$('div.rc-dialog-body'))!
        await this.page.waitForTimeout(200)
        const foodOptionElements = await modal.$$('div.lu-collapse-local > div')
        const foodOptions: FoodOption[] = []
        console.log(foodOptionElements.length)
        for (const element of foodOptionElements){

            const expander = (await element.$('div.lu-collapse-header'))!
            const foodOptionName = await expander.$eval('span.MenuItemDetail_optionsHeaderTitle', el => (el as HTMLElement).innerText)
            const ariaExpanded = await element.$eval('div.lu-collapse-header', el => el.getAttribute('aria-expanded'))
            // console.log(ariaExpanded)
            if (ariaExpanded === "false") expander.evaluate((el: any) => el.click())
            await modal.waitForSelector('div.MenuItemOptionGroup_optionItem')
            // show more button
            const showMoreButton = await modal.$x(`//button[contains(., "Show more")]`)
            if (showMoreButton.length > 0) showMoreButton[0].evaluate((button: any) => button.click())
            // get options
            const optionElements = await element.$$('div.MenuItemOptionGroup_optionItem')
            const options: Option[] = []
            for (const option of optionElements){
                const optionName = await option.$eval('span', el => (el as HTMLElement).innerText)
                const priceEl = await option.$('div.MenuItemOptionGroup_optionItemInfoPrice')
                let price: string | undefined
                if (priceEl !== null) price = (await (await priceEl.getProperty('innerText')).jsonValue()) as string
                options.push({
                    name: optionName,
                    price
                })
            }

            const choices: string = await element.$eval('p.MenuItemDetail_optionsHeaderInfo', el => (el as HTMLElement).innerText)
            let min: number = 0
            let max: number | undefined
            if (choices === "Select as many as you like"){
                min = 0
            } else if (choices === "RequiredSelect only one" || choices === "Select only one"){
                min = 1
                max = 1
            } else if (choices === "Select up to 1"){
                min = 0
                max = 1
            } else {
                console.log('---------------choices not listed', choices)
            }

            foodOptions.push({
                name: foodOptionName,
                minChoices: min,
                maxChoices: max,
                options
            })
        }
        const closeButton = (await this.page.$('#menuItemDetailCloseButton'))!
        await closeButton.evaluate((el:any) => el.click())
        await this.page.waitForFunction('!window.location.href.includes("item")')
        return foodOptions
    }

    async scrapeMenu(): Promise<CategoryInfo[]> {
        await this.page.waitForSelector('div.MenuItemListStandard_local > div')
        const categories: puppeteer.ElementHandle<Element>[] = (await this.page.$$('div.MenuItemListStandard_local > div')).slice(0, -1)

        const categoryInfo: CategoryInfo[] = []

        for (const category of categories){
            // get category name
            const title: string = await category.$eval('h3.MenuCategory_title', el => (el as HTMLElement).innerText)


            const items: puppeteer.ElementHandle<Element>[] = await category.$$('div.MenuItemListStandard_menuItemList > div')
            const scrapedItems: Item[] = []
            for (const item of items){
                const name: string = await item.$eval('button > div > h4', el => (el as HTMLElement).innerText)
                console.log(name)
                const descriptionElement = await item.$('button > div > div > div.MenuItem_description')
                let description: string = ''
                if (descriptionElement !== null){
                    description = (await (await descriptionElement.getProperty('innerText')).jsonValue()) as string
                }
                const price: string = await item.$eval('button > div > div > p.MenuItem_price', el => (el as HTMLElement).innerText)
                const img = await item.$('img')
                let image: string | undefined
                if (img === null){
                    console.log('NO IMAGE', name)
                } else {
                    image = (await item.$eval('img', el => el.getAttribute('src')))!
                    console.log('IMAGE: ', image)
                }
                const foodOptions: FoodOption[] = await this.scrapeFoodOptions(item)
                scrapedItems.push({
                    name,
                    description,
                    price,
                    foodOptions,
                    image
                })
            }
            categoryInfo.push({
                categoryName: title,
                items: scrapedItems
            })
        }

        return categoryInfo
    }

}

if (require.main === module) {
    // basically python name==main
    (async () => {
        const m = new MenuMaker(website)
        await m.init()
        // const menu: any = await m.scrapeMenu()
        // m.writeToFile(restaurantName, menu)
    })()
}