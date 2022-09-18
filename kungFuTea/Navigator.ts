import * as puppeteer from "puppeteer";

export interface Option {
    foodOption: string,
    option: string
}

export interface OrderArgs {
    item: string,
    options: Option[],
    quantity: number
}

export interface CheckoutArgs {
    firstName: string,
    lastName: string,
    email: string,
    phoneNumber: string,
    cardNumber: string,
    cardExp: string,
    cardCCV: string,
    cardZip: string,
    tip: string
}

export class Navigator {
    url: string
    menuItemToId: Map<string, string>
    browser: puppeteer.Browser
    page: puppeteer.Page
    modal: puppeteer.ElementHandle<Element>

    constructor() {
        this.url = 'https://kungfutea.thelevelup.com/auth/email?&fulfillment=pickup&lat=42.4072107&lng=-71.3824374'
        this.menuItemToId = new Map<string, string>()
    }

    async init(headless: boolean): Promise<boolean> {
        this.browser = await puppeteer.launch({headless: headless})
        this.page = await this.browser.newPage()
        await this.page.goto(this.url)
        await this.login()
        await this.page.goto('https://kungfutea.thelevelup.com/locations/631105?fulfillment=pickup&lat=42.4061298&lng=-71.3828549')
        await this.clickSaveLocation()
        await this.scrapeItemInfo()
        return true
    }

    async login(): Promise<void>{
        await this.page.waitForSelector('#checkEmailEmailInput')
        const loginField: puppeteer.ElementHandle<Element> | null = await this.page.$('#checkEmailEmailInput')
        if (loginField === null) console.log('CANNOT FIND LOGIN FIELD')
        else await loginField.type('raymondqin@toppingsapp.com')

        const nextButton: puppeteer.ElementHandle<Element> | null = await this.page.$('#checkEmailSubmit')
        if (nextButton === null) console.log('CANNOT FIND LOGIN NEXT BUTTON')
        else await nextButton.evaluate((button: any) => button.click())

        await this.page.waitForSelector('#signInPasswordInput')
        const pwField: puppeteer.ElementHandle<Element> | null = await this.page.$('#signInPasswordInput')
        if (pwField === null) console.log('CANNOT FIND PASSWORD FIELD')
        else await pwField.type('Toppings2022!')

        const loginButton: puppeteer.ElementHandle<Element> | null = await this.page.$('#signInLogInButton')
        if (loginButton === null) console.log('CANNOT FIND SIGN IN BUTTON')
        else await loginButton.evaluate((button: any) => button.click())
    }

    async scrapeItemInfo(): Promise<void>{
        const itemToId = async(item: puppeteer.ElementHandle<Element>) : Promise<void> => {
            const name: string | null = await item.$eval('h4', el => (el as HTMLElement).innerText)
            if (name === null){
                console.log('CANNOT FIND ITEM NAME')
            }

            const buttonId: string | null = await item.$eval('button', el => el.getAttribute('id'))
            if (buttonId === null){
                console.log('CANNOT FIND CLICKING ELEMENT FOR ITEM:', name)
            }

            this.menuItemToId.set(name, buttonId!)
        }
        /*
            first div is category title
            second div is a list of all the items in that category
        */
        await this.page.waitForSelector('div.MenuItemListStandard_menuItemList > div')
        const items: puppeteer.ElementHandle<Element>[] = await this.page.$$('div.MenuItemListStandard_menuItemList > div')

        const itemTasks: Promise<void>[] = []

        for (const item of items) itemTasks.push(itemToId(item))

        await Promise.all(itemTasks)

    }

    async clickSaveLocation(): Promise<void>{
        await this.page.waitForSelector('div.lu-button-content')
        const saveButton: puppeteer.ElementHandle<Element> | null = await this.page.$('div.lu-button-content')
        // console.log(saveButton)
        await saveButton?.evaluate((button: any) => button.click())
    }

    async addOrderToCart(args: OrderArgs): Promise<void> {
        const { item, options, quantity } = args

        // item
        try {
            // console.log(this.menuItemToId)
            await this.page.$eval(`#${this.menuItemToId.get(item)}`, (button: any) => button.click())
            await this.page.waitForSelector('#menuItemDetailModal')
            this.modal = (await this.page.$('#menuItemDetailModal'))!
        } catch(e) {
            console.error('CANNOT FIND MENU ITEM: ', item)
            return;
        }

        let first: boolean = true
        // options
        for (const option of options){
            // console.log(option)
            try {
                // open the category first
                if (first) {
                    // if first --> category is alr open
                    first = false
                } else {
                    // category not opened yet
                    const [foodOptionText] = await this.modal.$x(`//span[contains(., "${option.foodOption}")]`)
                    await foodOptionText.evaluate((button: any) => button.click())
                }

                // sometimes show more options
                const showMoreButton = await this.modal.$x(`//button[contains(., "Show more")]`)
                if (showMoreButton.length > 0) showMoreButton[0].evaluate((button: any) => button.click())

                const incrementButton: puppeteer.ElementHandle<Element> | null = await this.modal.$('div[class="MenuItemOptionGroup_optionItemWrapper"] > div > button[aria-label="Quantity Plus"]')
                if (incrementButton === null){
                    //no increment button --> just click on the option (probably radio button or checkbox)
                    await this.modal.waitForXPath(`//span[contains(., "${option.option}")]`)
                    const [optionText] = await this.modal.$x(`//span[contains(., "${option.option}")]`)
                    console.log('optiontext', optionText)
                    optionText.evaluate((button: any) => button.click())
                } else {
                    //just click the increment button
                    incrementButton.evaluate((button: any) => button.click())
                }

            } catch(e) {
                console.error('CANNOT FIND OPTION: ', option)
                console.error(e)
                return;
            }
        }

        // quantity
        // console.log(this.modal.innerText)
        if (quantity < 1){
            console.error('QUANTITY CANNOT BE LESS THAN 1')
            return;
        }
        const incrementButton: puppeteer.ElementHandle<Element> | null = await this.modal.$('div[class="MenuItemDetail_info "] > div > div > button[aria-label="Quantity Plus"]')
        if (incrementButton !== null){
            for (let i=0; i<quantity-1; i++) await incrementButton.evaluate((button: any) => button.click())
        } else {
            console.error('CANNOT INCREASE QUANTITY')
            return;
        }

        // comment
        // const textArea: puppeteer.ElementHandle<Element> | null = await this.modal.$('textarea[id="specialInstructions"]')
        // if (textArea !== null){
        //     await textArea.type(comment)
        // } else {
        //     console.log('CANNOT ENTER COMMENT')
        //     return;
        // }

        // add to cart
        const addToCartButton: puppeteer.ElementHandle<Element> | null = await this.modal.$('#menuItemDetailAddItemButton')
        if (addToCartButton !== null){
            await addToCartButton!.evaluate((button: any) => button.click())
        } else {
            console.log('CANNOT ADD TO CART')
            return;
        }

        // waiting for page to redirect
        // await this.wait()
    }

    async checkout(): Promise<boolean> {

        // go to cart
        const checkoutButton: puppeteer.ElementHandle<Element> | null = await this.page.$('#orderButtonSubmit')
        if (checkoutButton === null){
            console.log('CANNOT CHECKOUT BUTTON')
            return false
        }
        try {
            await checkoutButton.evaluate((button: any) => button.click())
        } catch (e) {
            console.log('COULD NOT PLACE ORDER', e)
            return false
        }

        // sometimes it tells u to checkout again
        console.log(this.page.url())
        if (this.page.url() === "https://kungfutea.thelevelup.com/auth/email?next=locations%2F631105%2Forder%2Freview&prev=orderreview&fulfillment=pickup&lat=42.4061298&lng=-71.3828549"){
            this.login()
        }

        // tip
        // const tipField: puppeteer.ElementHandle<Element> | null = await this.page.$('input[aria-label="custom amount input"]')
        // if (tipField === null){
        //     console.log('CANNOT FIND TIP FIELD')
        //     return false;
        // }
        // await tipField.type(tip)

        // place order
        // const placeOrderButton: puppeteer.ElementHandle<Element> | null = await this.page.$('#orderButtonSubmit')
        // if (placeOrderButton === null){
        //     console.log('CANNOT FIND PLACE ORDER BUTTON')
        //     return false
        // }
        // try {
        //     await placeOrderButton.evaluate((button: any) => button.click())
        //     return true
        // } catch (e) {
        //     console.log('COULD NOT PLACE ORDER', e)
        //     return false
        // }
        return true

    }

    async exit() {
        await this.browser.close()
    }
}

if (require.main === module) {
    // basically python name==main
    (async () => {
        const n = new Navigator();
        await n.init(false)
        // const c: CheckoutArgs = {
        //     firstName: 'f',
        //     lastName: 'l',
        //     email: 'e',
        //     phoneNumber: '1',
        //     cardNumber: '1111111111',
        //     cardExp: '10/22',
        //     cardCCV: '111',
        //     cardZip: '99999',
        //     tip: '10.21'
        // }
        // await n.checkout(c)
        // await n.exit()
    })()
}