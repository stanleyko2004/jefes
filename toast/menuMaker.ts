import * as puppeteer from "puppeteer";
import * as fs from "fs"

const toastWebsite = 'https://www.toasttab.com/saloniki-harvard-square/v3/'
const goodComputer = false
const headless = false
const restaurantName = 'Salonikis'

interface Option {
    name: string
    price: number | undefined
}

interface FoodOption {
    name: string
    numChoices: number | null
    minChoices: number
    required: boolean
    options: Option[]
}

interface ItemInfo {
    name: string,
    description: string,
    price: number,
    href: string,
    foodOptions: FoodOption[],
    image: string | undefined,
}

interface CategoryInfo {
    name: string,
    menuItems: ItemInfo[]
}

class MenuMaker {

    url: string
    browser: puppeteer.Browser
    page: puppeteer.Page
    modal: puppeteer.ElementHandle<Element>

    constructor(url: string) {
        this.url = url
    }

    async init(): Promise<void> {
        this.browser = await puppeteer.launch({headless: headless})
    }

    writeToFile(filename: string, menu: CategoryInfo[]) {
        fs.writeFileSync(filename + '.json', JSON.stringify(menu, null, 4))
    }

    async menuMaker(): Promise<CategoryInfo[]> {
        this.page = await this.browser.newPage()
        this.page.setDefaultTimeout(0)
        await this.page.goto(this.url)
        await this.wait()
        if (this.page.url().endsWith('/?mode=fulfillment')){
            // console.log('Ordering Ahead of Time')

            await this.editOrderTime(this.page)

            await this.page.goto(this.url)
            await this.page.waitForNavigation({waitUntil: 'networkidle0'});

        }
        const menu = await this.scrapeMenu()
        this.browser.close()
        return menu
    }

    async wait(): Promise<void> {await this.page.waitForNavigation({waitUntil: 'networkidle0'});}

    async editOrderTime(page: puppeteer.Page): Promise<void>{
        // sometimes modal pops up to let u order later when restaurant is closed
        const submitButton: puppeteer.JSHandle<unknown> | null = await page.$('button[data-testid="fulfillment-selector-submit"]')
        if (submitButton !== null) await submitButton.evaluate((button: any) => button.click())
    }

    async getItemInfo(item: puppeteer.ElementHandle<Node>) : Promise<ItemInfo | null> {
        const outOfStock: puppeteer.ElementHandle<Element>[] = await item.$$('span[data-testid="menu-item-out-of-stock-label"]')
        if (outOfStock.length > 0) return null

        const property: puppeteer.JSHandle<unknown> = await item.getProperty('href')
        const href: string = (await property.jsonValue()) as string
        const name: string = await item.$eval('span[data-testid="menu-item-name"]', (nameEl: any) => nameEl.innerText)
        const description: string = await item.$eval('p[data-testid="menu-item-description"]', (nameEl: any) => nameEl.innerText)
        const priceElement: puppeteer.ElementHandle<Element> | null = await item.$('span[data-testid="menu-item-price"] > span')
        let price: number = 0;
        if (priceElement != null){
            let priceText = (await priceElement.evaluate(el => el.textContent))!
            price = parseInt(priceText.match(/\d/g)!.join(''));
        }
        return {
            name: name,
            description: description,
            price: price,
            href: href,
            foodOptions: [],
            image: undefined,
        }
    }

    async getCategoryInfo(element: puppeteer.ElementHandle<Node>): Promise<CategoryInfo>{
        const categoryName: string = await element.$eval('h3[data-testid="menu-group-name"]', el => (el as HTMLElement).innerText)

        const res: CategoryInfo = {
            name: categoryName,
            menuItems: []
        }
        // await this.page.waitForNavigation({waitUntil: 'load', timeout: 120000})

        const items: puppeteer.ElementHandle<Node>[] = await element.$$('a[data-testid="menu-item-link"]')
        const itemInfoTasks: Promise<ItemInfo | null>[] = []
        for (const item of items) itemInfoTasks.push(this.getItemInfo(item))
        const itemInfo: (ItemInfo | null)[] = await Promise.all(itemInfoTasks)

        for (const item of itemInfo){
            if (item != null){
                res.menuItems.push(item)
            }
        }

        return res
    }

    async scrapeOption(element: puppeteer.ElementHandle<Element>): Promise<Option | null>{
        const outOfStock: puppeteer.ElementHandle<Node>[] = await element.$x('//span[text()="-Out of stock-"]')
        if (outOfStock.length > 0) return null

        const name: string = await element.$eval('div[data-testid="modifierDescription"] > div', el => (el as HTMLElement).innerText)
        const priceElement: puppeteer.ElementHandle<Element> | null = await element.$('span[data-testid="modifiers-price"] > span')
        let price: number | undefined;
        if (priceElement != null){
            let priceText = (await priceElement.evaluate(el => el.textContent))!
            if (priceText) price = parseInt(priceText.match(/\d/g)!.join(''));
        }

        return {
            name: name,
            price: price
        }
    }

    async scrapeFoodOption(fieldset: puppeteer.ElementHandle<Element>): Promise<FoodOption>{
        const name: string = await fieldset.$eval('div[data-testid="fieldset-label"]', el => (el as HTMLElement).innerText)

        const instructions: string = await fieldset.$eval('span[data-testid="fieldset-instructions"]', el => el.innerHTML)
        let numChoices: number | null = null;
        let minChoices: number = 0;
        if (instructions === ''){
            numChoices = null
            minChoices = 0
        } else {
            // this'll be either "Please choose x" or "Please choose up to x"
            const splitted: string[] = instructions.split(' ')
            const x: number = parseInt(splitted[splitted.length-1])
            if (instructions.includes('up to')){
                minChoices = 0
            } else {
                minChoices = x
            }
            numChoices = x
        }
        const required: boolean = minChoices !== 0

        const optionElements: puppeteer.ElementHandle<Element>[] = await fieldset.$$('div[role="group"]')
        const optionTasks: Promise<Option | null>[] = []
        for (const optionElement of optionElements) optionTasks.push(this.scrapeOption(optionElement))
        const options = await Promise.all(optionTasks)
        const nonNullOptions: Option[] = options.filter(n => n) as Option[] // somehow gets rid of all the nulls ???

        return {
            name: name,
            numChoices: numChoices,
            minChoices: minChoices,
            required: required,
            options: nonNullOptions
        }
    }

    async scrapeFoodOptions(item: ItemInfo): Promise<void> {
        const page = await this.browser.newPage()
        await page.setDefaultNavigationTimeout(0);
        await page.goto(item.href)
        await page.waitForNavigation({waitUntil: 'networkidle0'});
        if (page.url().endsWith('/?mode=fulfillment')){
            // console.log('Ordering Ahead of Time')

            await this.editOrderTime(page)

            await page.goto(item.href)
            await page.waitForNavigation({waitUntil: 'networkidle0'});

        }
        const modal: puppeteer.ElementHandle<Element> = (await page.$('div[id="modal-root"]'))!

        try {
          const img: string = await modal.$eval('div[data-testid="modifier-image-url"]', (nameEl: any) => nameEl.getAttribute('style'));
          console.log(img)
          if (img) item.image = img.substring(23, img.length - 3);
        } catch (err) {
          console.log(`No image ${item.name}` + err);
        }

        const foodOptionElements: puppeteer.ElementHandle<Element>[] = (await modal.$$('fieldset[data-testid="fieldset-group"]'))
        // last food option is always special instructions which is a textarea
        foodOptionElements.pop()

        const foodOptionTasks: Promise<FoodOption>[] = []
        for (const foodOption of foodOptionElements) foodOptionTasks.push(this.scrapeFoodOption(foodOption))
        const foodOptions: FoodOption[] = await Promise.all(foodOptionTasks)

        item.foodOptions = foodOptions
        await page.close()
    }

    async scrapeMenu(): Promise<CategoryInfo[]> {
        const categories: puppeteer.ElementHandle<Element>[] = await this.page.$$('li[data-testid="menu-groups"]')
        const categoryInfoTasks: Promise<CategoryInfo>[] = []
        for (const category of categories) categoryInfoTasks.push(this.getCategoryInfo(category))
        console.log(categoryInfoTasks.length)
        const menu: CategoryInfo[] = await Promise.all(categoryInfoTasks)

        const foodOptionsTasks: Promise<void>[] = []

        if (goodComputer){
            for (const {menuItems} of menu){
                for (const item of menuItems){
                    // await this.scrapeFoodOptions(item)
                    foodOptionsTasks.push(this.scrapeFoodOptions(item))
                }
            }

            // laggy af
            await Promise.all(foodOptionsTasks)
        } else {
            for (const {menuItems} of menu){
                for (const item of menuItems){
                    await this.scrapeFoodOptions(item)
                    // foodOptionsTasks.push(this.scrapeFoodOptions(item))
                }
            }
        }

        return menu
    }

}

if (require.main === module) {
    // basically python name==main
    (async () => {
        const m = new MenuMaker(toastWebsite)
        // await m.menuMaker()
        await m.init()
        const menu: CategoryInfo[] = await m.menuMaker()
        m.writeToFile(restaurantName, menu)
        // const f = await m.scrapeFoodOptions('https://www.toasttab.com/el-jefes-taqueria/v3/add/fbe55c3f-aac0-41a5-a0d2-63c2432e7830/9544f60e-cd2e-46c7-b39f-8b2c16ea1c2c')
        // console.log(JSON.stringify(f, null, 4))
        // const menu: CategoryInfo[] = await m.scrapeMenu()
        // console.log(JSON.stringify(menu, null, 4))
    })()
}